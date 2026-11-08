# Photo and video scanning: questions for a provider

Status: draft. Nothing has been sent to any provider. Photos and videos stay refused until a provider is signed and connected
(`lib/image-scan.ts`, lawyer packet decision 10). That gate is not switched off to launch.

## What we need

- Matching of uploaded photos and videos against known child-abuse material (hash matching), with a route to report matches to NCMEC.
- A classifier for new material, if the provider offers one. Any match goes to a person before anything happens.
- Nothing about AI generation decides a public label or a removal on its own.

## Questions to ask

1. Price per photo and per video, minimum commitment, and the yearly cost at 10,000 uploads a month.
2. Do you sign a data processing agreement? Send yours.
3. Retention: can we set zero retention? Is each file deleted after it is checked?
4. Training: do you use our content to train or improve your services? We need the answer to be no, in writing.
5. Human review: does anyone see the content, at your company or a subcontractor? Who, where, and under what agreement?
6. Where is data processed and stored? Can it stay in one named region?
7. Australian law: what do you support for NCMEC and eSafety reporting, and what must we do?
8. Access: the route and timeline to production access, and whether a separate agreement with Thorn is needed.
9. Sub-processors: the full list.
10. Security: a SOC 2 Type II report, encryption at rest and in transit, and access logs.

## Decision needed from the operator

- Approve the questions above, and say who sends them. Once the answers are in, counsel reviews the terms before any
  user data goes to the provider.
