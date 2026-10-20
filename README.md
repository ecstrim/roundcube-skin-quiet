# roundcube-skin

**Quiet**, a calm skin for Roundcube Webmail 1.6 that extends Elastic. It restyles login, mail, the open message,
compose, contacts and settings, and has a full dark mode. Install and credits: [skins/quiet/README.md](skins/quiet/README.md).
Design and mockups: [docs/specs/2026-10-19-quiet-skin-design.md](docs/specs/2026-10-19-quiet-skin-design.md).

## Dev stack

Everything runs in Docker (no Node or PHP on the host). The stack is a throwaway GreenMail/Dovecot plus three
Roundcube 1.6.10 containers with `skins/quiet` bind-mounted, so edits show on reload.

| URL | What |
| --- | --- |
| http://127.0.0.1:8460 | Roundcube with the `archive` and `zipdownload` plugins (GreenMail) |
| http://127.0.0.1:8461 | Roundcube with no plugins (GreenMail) |
| http://127.0.0.1:8462 | Roundcube on Dovecot (IMAP THREAD works, for thread-mode tests) |

Login on all of them: `klaus` / `klaus`. Only the throwaway mailboxes are involved, never real mail.

The web UI binds to `127.0.0.1`. To reach it from another machine, put `QUIET_HOST=<this host's LAN IP>` in
`dev/.env` (git-ignored) and run `make up` again.

```
make up      # start the stack
make seed    # (re)fill the mailboxes with the fixture mail (dev/seed/seed.py)
make css     # compile skins/quiet/styles/*.less to the committed .min.css
make e2e     # Playwright suite in a container (ARGS="tests/e2e/list.spec.ts" to run one spec)
make shots   # screenshots of every screen into test-results/shots/ (git-ignored)
make down    # stop the stack
```

`make shots` writes mail, message, compose, login, contacts and settings (plus the all-headers dialog) at 1440px
light and dark, 1024px light and 390px light and dark. Running `make e2e` clears `test-results/`, so run `make shots` last.

The specs share one Roundcube user. Specs that change list prefs (sort, threads, page size) restore them, and
`tests/e2e/global-setup.ts` plus `resetPrefs()` in `tests/e2e/helpers.ts` reset them before each run.

## Licence

- `skins/quiet/` (the skin itself): **CC BY-SA 3.0**, because it adapts Roundcube's Elastic skin, which uses that
  licence. Bundled fonts (OFL 1.1) and icons (ISC) keep their own licences. See
  [skins/quiet/LICENSE](skins/quiet/LICENSE).
- Everything else (dev stack, tests, tooling, docs): **public domain**, under [CC0 1.0](LICENSE).
