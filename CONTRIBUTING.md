# Contributing to Quiet

Issues and pull requests are welcome. Please run `make e2e` before sending a change, and `make showcase` if it
changes how the screenshots look. Contributions are accepted under the repo's licences (see
[Licence](README.md#licence)): CC BY-SA 3.0 inside `skins/quiet/`, CC0 everywhere else.

## Dev stack

You need Docker (with Compose v2) and `make`. Everything runs in containers (no Node or PHP on the host). The
stack is a throwaway GreenMail/Dovecot plus three Roundcube 1.6.20 containers with `skins/quiet` bind-mounted,
so edits show on reload.

| URL | What |
| --- | --- |
| http://127.0.0.1:8460 | Roundcube with the `archive` and `zipdownload` plugins (GreenMail) |
| http://127.0.0.1:8461 | Roundcube with no plugins (GreenMail) |
| http://127.0.0.1:8462 | Roundcube on Dovecot (IMAP THREAD works, for thread-mode tests) |

Login on all of them: `klaus` / `klaus`. Only the throwaway mailboxes are involved, never real mail.

The web UI binds to `127.0.0.1`. To reach it from another machine, put `QUIET_HOST=<this host's LAN IP>` in
`dev/.env` (git-ignored) and run `make up` again.

First run: `make up seed css e2e`, in that order. `make seed` must come before `make e2e` (the suite expects
the fixture mail), and again after anything that empties the mailboxes. The first `make up` and `make e2e`
download several images (Roundcube, GreenMail, Dovecot, Node, Python, Playwright), and Roundcube needs about
15 seconds after `make up` before the URLs answer. The tests reach Roundcube over the compose network, so they
do not use the host ports. `make css` also creates `node_modules/` and a copy of Elastic's sources in
`skins/elastic/` (both git-ignored).

```
make up      # start the stack
make seed    # (re)fill the mailboxes with the fixture mail (dev/seed/seed.py)
make css     # compile skins/quiet/styles/*.less to the committed .min.css
make e2e     # Playwright suite in a container, ~9 min (ARGS="tests/e2e/list.spec.ts" to run one spec)
make shots   # screenshots of every screen into test-results/shots/ (git-ignored)
make down    # stop the stack
```

`make shots` writes mail, message, compose, login, contacts and settings (plus the all-headers dialog) at 1440px
light and dark, 1024px light and 390px light and dark. Running `make e2e` clears `test-results/`, so run `make shots` last.
`make showcase` regenerates the README screenshots in `docs/screenshots/` from a separate `demo` mailbox
(`dev/seed/showcase.py`), so they never show test fixtures.

The specs share one Roundcube user. Specs that change list prefs (sort, threads, page size) restore them, and
`tests/e2e/global-setup.ts` plus `resetPrefs()` in `tests/e2e/helpers.ts` reset them before each run.
