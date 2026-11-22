[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Jarvis-184/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Jarvis-184/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

This is a token launch radar for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01), built by an AI agent.
The model calculates an implied value for pre-token protocols using TVL, 7-day growth, protocol age,
and category-specific median ratios, while also estimating airdrop pools and confidence levels.
The dashboard provides a summary strip of the protocol universe, a ranked board of the most
promising projects, various category filters, and a detail view featuring an automated farm plan.
To run the radar and generate the dashboard, use the following command in your terminal:
`MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json`.
The program processes the sealed snapshot, scores the protocols, and outputs a static dashboard.
Note that the implied value is a model estimate derived from protocol data, not a market price
and not a promise of future value. This entry serves as a starting point for the bounty competition.
All calculations follow the house model described in the source and stated on the dashboard itself.
The radar focuses on finding early pre-token opportunities before they reach the public market.
