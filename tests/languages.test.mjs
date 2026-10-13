// Unit checks for the language list and the language guess in lib/languages.ts. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { LANGUAGES, detectLanguage, isLanguageCode, isSpeakLevel, languageName } from "../lib/languages.ts"

test("every language code is unique, two letters, and named", () => {
  const codes = LANGUAGES.map((language) => language.code)
  assert.equal(new Set(codes).size, codes.length)
  for (const language of LANGUAGES) {
    assert.match(language.code, /^[a-z]{2}$/)
    assert.ok(language.name.length > 0 && language.native.length > 0)
  }
})

test("codes resolve to names, and unknown codes do not", () => {
  assert.equal(languageName("es"), "Spanish")
  assert.equal(languageName("xx"), null)
  assert.equal(isLanguageCode("hi"), true)
  assert.equal(isLanguageCode("klingon"), false)
})

test("only the three speak levels are accepted", () => {
  assert.equal(isSpeakLevel("native"), true)
  assert.equal(isSpeakLevel("fluent"), true)
  assert.equal(isSpeakLevel("conversational"), true)
  assert.equal(isSpeakLevel("expert"), false)
})

const CASES = [
  ["en", "This is a short note, and I think you will like the new park near the river today."],
  ["es", "Hola, ¿cómo estás? Estoy muy bien, gracias por preguntar y espero verte pronto en la ciudad."],
  ["fr", "Bonjour, je suis très contente de vous voir ici avec nous, merci pour le café et les gâteaux."],
  ["de", "Danke für die Einladung, ich komme gern am Samstag und bringe auch den Kuchen mit, bitte."],
  ["it", "Ciao a tutti, grazie per la bella serata e per il vino che abbiamo bevuto insieme questo fine settimana."],
  ["pt", "Olá, tudo bem? Obrigado pela mensagem, eu vou estar em casa amanhã e podemos conversar também."],
  ["nl", "Hallo, dank je wel voor het mooie boek en de koffie die we vandaag samen hebben gedronken."],
  ["vi", "Xin chào bạn, cảm ơn bạn rất nhiều vì đã giúp tôi hôm qua, hẹn gặp lại bạn sớm nhé."],
  ["id", "Terima kasih banyak untuk bantuannya kemarin, saya akan datang ke rumah kamu besok sore."],
  ["tr", "Merhaba, teşekkür ederim, yarın akşam bizimle birlikte yemek yemek ister misin, çok güzel olur."],
  ["hi", "नमस्ते, आप कैसे हैं? मैं आज बाज़ार जा रहा हूँ, क्या आप भी मेरे साथ चलना चाहेंगे?"],
  ["bn", "আমি আজকে বাজারে যাচ্ছি, তুমি কি আমার সাথে আসবে? অনেক দিন দেখা হয়নি তোমার সাথে।"],
  ["ar", "مرحبا، كيف حالك اليوم؟ أنا بخير والحمد لله، هل تريد أن نلتقي في المقهى غداً مساءً؟"],
  ["fa", "سلام، حال شما چطور است؟ امروز به بازار رفتم و کمی میوه و سبزی خریدم، خیلی خوب بود."],
  ["ur", "آپ کیسے ہیں؟ میں آج بازار جا رہا ہوں، کیا آپ بھی میرے ساتھ چلنا پسند کریں گے؟ شکریہ۔"],
  ["ru", "Привет, как дела? Я сегодня ходил в магазин и купил хлеб, молоко и немного сыра."],
  ["uk", "Привіт, як справи? Сьогодні я ходив у магазин і купив хліб, молоко та трохи сиру для вас."],
  ["el", "Γεια σου, τι κάνεις σήμερα; Πήγα στη θάλασσα με τους φίλους μου και είχαμε πολύ ωραία μέρα."],
  ["ja", "こんにちは、今日は天気がいいですね。一緒に公園へ散歩に行きませんか？とても楽しいと思います。"],
  ["zh", "你好，今天天气很好。我们一起去公园散步吧，我觉得这是一个非常好的主意，我很期待。"],
  ["ko", "안녕하세요, 오늘 날씨가 정말 좋네요. 같이 공원에 산책하러 갈래요? 아주 즐거울 거예요."],
  ["th", "สวัสดีครับ วันนี้อากาศดีมาก ไปเดินเล่นที่สวนสาธารณะด้วยกันไหมครับ น่าจะสนุกมาก"],
]

for (const [code, text] of CASES) {
  test(`detects ${code} from a sentence of its own`, () => {
    assert.equal(detectLanguage(text), code)
  })
}

test("too short to judge gives no language", () => {
  assert.equal(detectLanguage("hola amigo"), null)
  assert.equal(detectLanguage(""), null)
  assert.equal(detectLanguage("😀😀😀 🎉🎉"), null)
})

test("links, mentions and hashtags do not decide the language", () => {
  const text = "https://example.com/some/long/path/with/words @someone #tagged $ABC and the rest of this is English, you know"
  assert.equal(detectLanguage(text), "en")
  assert.equal(detectLanguage("https://example.com/hola/como/estas/gracias/por/todo/muy/bien #hashtag"), null)
})

test("a text with two languages equally strong gives no language", () => {
  // Three English and three Spanish stop words each: better to say nothing than to guess.
  assert.equal(detectLanguage("the de and la, the de and la, the de and la"), null)
})

test("a text with a clear lead in one language still names it", () => {
  // Seven Spanish stop words against five English ones: Spanish is clearly ahead.
  assert.equal(detectLanguage("the de la and que el is en los you with por"), "es")
})

test("Japanese with mostly kanji is still Japanese, because of its kana", () => {
  assert.equal(detectLanguage("東京都庁の展望台から見る夜景は本当に素晴らしい。ぜひ行ってみてください。"), "ja")
})

test("a mostly-English post with one foreign word is English", () => {
  assert.equal(detectLanguage("I finally finished the marathon and it was the best day of my whole year, truly."), "en")
})
