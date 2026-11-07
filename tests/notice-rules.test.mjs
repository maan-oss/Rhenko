// The rules a copyright notice and a counter-notice must meet (lib/notice-rules.ts), under 17 U.S.C. 512(c)(3)(A) and 512(g)(3).
import { test } from "node:test"
import assert from "node:assert/strict"
import { copyrightNoticeProblem, counterNoticeProblem, validPhone } from "../lib/notice-rules.ts"

const goodCopyright = {
  kind: "copyright",
  work: "A Tale of Two Cities",
  url: "https://rhenko.app/status/abc",
  address: "12 Example Road, Pune 411001",
  phone: "+91 98765 43210",
  authorized: true,
}

test("a telephone number needs six digits and only usual characters", () => {
  assert.equal(validPhone("+91 98765 43210"), true)
  assert.equal(validPhone("(020) 7946-0958"), true)
  assert.equal(validPhone("12345"), false)
  assert.equal(validPhone("call me"), false)
  assert.equal(validPhone("1".repeat(31)), false)
})

test("a complete copyright notice passes", () => {
  assert.equal(copyrightNoticeProblem(goodCopyright), null)
})

test("a copyright notice needs the work, the link, an address, a telephone number and the authority statement", () => {
  assert.match(copyrightNoticeProblem({ ...goodCopyright, work: "ab" }), /work/)
  assert.match(copyrightNoticeProblem({ ...goodCopyright, url: "" }), /link/)
  assert.match(copyrightNoticeProblem({ ...goodCopyright, address: "Pune" }), /postal address/)
  assert.match(copyrightNoticeProblem({ ...goodCopyright, phone: "" }), /telephone/)
  assert.match(copyrightNoticeProblem({ ...goodCopyright, authorized: false }), /perjury/)
})

test("the copyright rules apply only to copyright notices", () => {
  assert.equal(copyrightNoticeProblem({ kind: "privacy", work: "", url: "", address: "", phone: "", authorized: false }), null)
})

const goodCounter = {
  name: "Asha Rao",
  address: "12 Example Road, Pune 411001",
  phone: "+91 98765 43210",
  signature: "Asha Rao",
  mistake: true,
  consent: true,
}

test("a complete counter-notice passes", () => {
  assert.equal(counterNoticeProblem(goodCounter), null)
})

test("a counter-notice needs the name, address, telephone, signature, the perjury statement and the consent", () => {
  assert.match(counterNoticeProblem({ ...goodCounter, name: "A" }), /full name/)
  assert.match(counterNoticeProblem({ ...goodCounter, address: "Pune" }), /postal address/)
  assert.match(counterNoticeProblem({ ...goodCounter, phone: "ring me" }), /telephone/)
  assert.match(counterNoticeProblem({ ...goodCounter, signature: "A" }), /signature/)
  assert.match(counterNoticeProblem({ ...goodCounter, mistake: false }), /perjury/)
  assert.match(counterNoticeProblem({ ...goodCounter, consent: false }), /jurisdiction/)
})
