# Screenshots

Referenced from the root README. These are captures from a real instance — a
temp-mail service is judged on how the inbox looks, and a README without one is
half a pitch.

| File | What it shows | In README |
| --- | --- | --- |
| `inbox.png` | The front page with mail already received | yes |
| `message.png` | An opened message with the extracted code chip | yes |
| `docs.png` | `/docs` at the quickstart, with the highlighted calls | yes |
| `dashboard.png` | `/dashboard` → Overview or Keys, signed in | not yet — needs a session, so it has to be taken by hand |

Retaking one:

- **Light mode**, 1440px wide, `deviceScaleFactor: 2`, no browser chrome.
- Set the viewport height so the shot ends just below the content — dead space
  at the bottom reads as a broken image.
- Use a real address on a real domain. Sender names can be made up; the
  addresses here are on `.test`, which is reserved and belongs to nobody.
- Check nothing sensitive is in frame: a live API key, a real personal address,
  an operator username.
- Keep them under ~400KB each so cloning the repo stays cheap.
