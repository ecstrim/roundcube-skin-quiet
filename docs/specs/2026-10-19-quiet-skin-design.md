---
title: Quiet — an Outlook-on-the-web style skin for Roundcube 1.6
date: 2026-10-19
status: active
---

# Quiet — Roundcube skin design

## Intent and why

The owner runs Roundcube Webmail **1.6.10** on a Linux machine and dislikes
the default Elastic skin. They want a skin that looks like the **current
Outlook on the web** (the Fluent-era "new Outlook": narrow app rail, calm
neutral surfaces, one blue accent). What they miss is the *clean look*.

The skin is called **Quiet** (folder `skins/quiet`, display name "Quiet").

## Goals

- A calm, uncluttered Roundcube that reads like Outlook on the web.
- Every visible control maps to something Roundcube 1.6 actually does.
- A proper **dark mode** from day one (the owner uses dark mode daily).
- Desktop first. **Phone layout is nice-to-have**, not a launch blocker.

## Non-goals

- Copying Outlook pixel-for-pixel or using Microsoft logos, names or assets.
- New mail features. This is a skin, not a plugin suite.
- Designing Contacts and Settings screen-by-screen (see "Other screens").

## Anti-goals (a failure even if it works)

- **Bloat**: toolbars full of buttons, ribbons, crowded headers.
- **Fake features**: any button dressed up like Outlook that Roundcube cannot
  back. If Roundcube (or an enabled plugin) can't do it, it isn't shown.

## Constraints

- Target: Roundcube **1.6.10** exactly (the owner's production version).
- Must install by copying one folder into `skins/` and selecting it in
  Settings. No core patches.
- Plugin-dependent buttons appear only when the plugin is enabled.
  **Archive** needs the `archive` plugin and **Download all** needs
  `zipdownload`.
- **Button scope is fixed to what this document names.** The owner will add
  buttons for other plugins (Junk, encryption, and so on) later. Quiet
  doesn't design places for them now, but a plugin that injects a button
  must not break the layout.
- Must not touch the owner's real mail during development.

## Reference mockups

The approved mockups live next to this file in
`docs/specs/2026-10-19-quiet-skin-mockups/` (self-contained HTML with inline
styles; open in a browser, ignore the `<x-dc>`/script wrapper). They are the
visual source of truth for spacing, sizes and colors.

| File | Shows | Status |
|---|---|---|
| `QuietB.dc.html` | Mail screen layout, light, list hover actions | Approved layout. **Its reading pane is outdated**: use `ReadR6` for the open message |
| `QuietBMulti.dc.html` | Several messages selected | Approved |
| `ReadR6.dc.html` | Open message (reading pane) | Approved |
| `ComposeDark.dc.html` | New message, dark | Approved |
| `LoginL1.dc.html` | Login card, dark/light | Approved |

## Look: tokens

The font stack is `"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`.
No web fonts are bundled. The base size is 14px. The corner radius is 6px for
controls and 8px for panes and boxes.

| Token | Light | Dark |
|---|---|---|
| App background (behind panes) | `#f0f0f0` | `#1b1b1b` |
| Pane / card surface | `#ffffff` | `#262626` |
| Inset surface (message box, inputs in compose) | `#ffffff` on `#fafafa` pane | message and compose body box: `#ffffff` (see Dark mode); other insets `#1f1f1f` |
| Text | `#242424` | `#e8e8e8` |
| Secondary text | `#616161` | `#adadad` |
| Border | `#e0e0e0` | `#3a3a3a` |
| Control border | `#d1d1d1` | `#4a4a4a` |
| Accent (fills, primary button) | `#0f6cbd` | `#115ea3` |
| Accent (text/links on surface) | `#0f6cbd` | `#62abf5` |
| Selected row | `#ebf3fc` (single) / `#cfe4fa` (multi) | builder picks, same roles |
| Danger tint (Delete) | bg `#fdf3f4`, border `#f1bbbc`, text `#b10e1c` | text `#ff9a9a`, builder picks a matching bg/border |

Text must keep at least 4.5:1 contrast in both themes.

## Screens

### Mail screen (`QuietB` + `ReadR6`)

From left to right:

1. **App rail** (~52px): icon buttons for Mail, Contacts and Settings. Any
   task buttons that plugins add go here too. The account button (initial in
   a circle) sits at the bottom and opens a small popover with **Dark mode**
   (the same toggle Elastic's task menu has today), **About** and **Log
   out**. *(Design call: Elastic 1.6 has no account menu, so this popover
   is new.)* There is no colored header band.
2. **Folder pane** (~210px): a primary **New mail** button, then the folder
   tree with unread counts. The selected folder is shown as a white "pill".
   The quota bar and "x of y used" text sit at the bottom. A small "···"
   button in the pane holds the folder actions: Empty, Compact and Manage
   folders. *(Design call.)*
3. **Message list** (~360px): a search field on top, then the folder title
   ("Inbox") with the existing list filter ("All ▾") beside it. A small list
   options button next to the filter holds sorting (column and order),
   threads on/off, Select all/none and Mark all as read. *(Design call: the
   approved mockups had no place for these real commands.)* Rows have two or
   three lines: sender, subject, preview snippet, and time on the right.
   Unread rows have a bold sender and subject plus a small accent dot.
4. **Reading pane**: the rest of the width.

**Hover quick actions (list rows).** When the pointer is over a row, a small
button group appears at the row's top-right, replacing the time: **Delete**
(danger tint), **Archive** (only with the plugin), **Flag** and **Mark
unread/read**. **A single click acts at once on that row's message.** It does
not open or select the message first, and it does not change the current
selection. Delete follows the user's Roundcube delete settings (move to Trash
or flag as deleted), just like the normal Delete command.

**Multi-select.** Selection works as in Roundcube today: click,
**Shift-click** for a range, **Ctrl/Cmd-click** to toggle. When **more than
one** message is selected:

- the hover quick actions are hidden;
- an action bar appears **next to the folder title**: "N selected", then
  Delete (icon and text, danger tint), and icon-only Archive, Flag, Mark read
  and Move to folder, then **×** to clear the selection;
- the reading pane shows an empty state: "N messages selected" with a hint
  about Shift/Ctrl-click.

Selecting one message keeps the normal behavior (it opens in the reading
pane, and the list header shows just the title and filter).

### Open message (`ReadR6`)

From top to bottom, on a slightly off-white pane (`#fafafa` light):

1. **Subject** (20px, semibold) with a **Flag** toggle icon. Its position is
   undecided by the owner (before the subject, after it, or far right). Ship
   it **far right** (builder default) and keep it easy to move.
2. **Sender line**: avatar (initials), name and address, then a small grey
   line "To: … · date · **Details** · **Headers** · **Plain text**".
   - *Details* toggles the full From/To/Cc/Date summary, like Elastic's
     "Summary".
   - *Headers* opens Roundcube's all-headers dialog, like Elastic.
   - *Plain text* switches HTML/plain view, like Elastic.
   - At the right end of the same line are compact buttons: **Reply** (icon
     and text), **Reply all** (icon only), **Forward** (icon only), a gap,
     then **Delete** (danger tint). Whether Delete shows its label is
     undecided: ship it with the label. Icon-only buttons need tooltips and
     `aria-label`.
3. **Attachments row** (only when there are attachments): file chips with
   name and size, then a "Download all" link.
4. **Message body** in a bordered white box (radius 8px).
5. **Row under the box**:
   - left side, quiet text buttons for the rarer actions: **Archive** (only
     with the plugin), **Move to…**, **Mark unread**, **Print**, **Download**
     (.eml) and **Show source**;
   - right side, **Reply**, **Reply all** and **Forward**, all with icon and
     text, then a larger gap and **Delete** (icon and text, danger tint).
   - There is no "···" overflow menu on the message. Anything else Roundcube
     offers on a message (e.g. "Open in new window", "Edit as new") goes in
     this row's left group. The builder can fold it into a "More" button only
     if the row would wrap at normal desktop widths.

There is no separate top command bar on the mail screen.

### New message (`ComposeDark`)

Compose is its own page, as in Roundcube. It takes the message list's and the
reading pane's space, and the rail and folder pane stay visible.

- **Top strip, right-aligned, quiet:** Signature (insert), Responses (canned
  responses), Options (a popover with Roundcube's compose options: priority,
  return receipt, DSN, save-sent folder, editor type), and **Discard** (danger
  text) set apart. Send and Save draft are **not** at the top.
- **Fields:** From (identity select), To with recipient chips, and
  **Cc / Bcc / Reply-To** links at the right of the To row that reveal those
  fields. Followup-To also exists in Roundcube and goes with them. Then
  Subject. Keep Roundcube's address-book picker for recipients, styled to
  match.
- **Attachments row** under Subject: attachment chips with remove ×, and an
  **Attach** button aligned right. Drag-and-drop upload should keep working.
- **Formatting bar:** a slim bar with only a few buttons (bold, italic,
  underline, lists, link, image, plus spellcheck if enabled) and the
  HTML/plain switch on the right. The editor itself is TinyMCE; restyle it,
  don't replace it.
- **Message body** in a bordered box (same style as `ReadR6`).
- **Under the box, left:** **Send** (primary accent) and **Save draft**.

### Login (`LoginL1`)

The owner wants a centered card on the app background. Inside it are a small
accent mail icon with the product name (Roundcube `product_name`), **a thin
separator line**, the "Sign in" title, Username, Password, a full-width
**Sign in** button, and, under the card, a "Get support" link (`support_url`,
only if set). The server/host field appears only if Roundcube is configured
to show it. Dark and light follow the same theme rule as the rest of the
skin.

### Other screens (Contacts, Settings, dialogs, errors)

"Same style, keep it simple." They reuse the same parts: rail, side pane,
list, content box, and the same buttons, inputs and colors. They get no
special layout work. Dialogs and popups use the card style. They must all
work in dark mode.

## Dark mode

Dark mode is required for every screen. It works the way Elastic's does in
1.6: the `prefers-color-scheme` default plus the stored Dark mode toggle,
which now lives in the account popover.

**Mail content stays light.** In dark mode, the open message's body box and
the compose editor body stay a **white box** with normal dark text inside
the dark interface. The mail's own HTML is never darkened or recolored. Only
the frame around the box is dark. The builder checks against 1.6.10's
source how Elastic stores the toggle and keeps the same mechanism, so
switching to Quiet keeps the owner's current choice.

## Narrow widths and phone

*(Design call.)*

- The full four-column layout is designed for **1200px and wider**.
- Below that, Quiet follows Elastic's tablet and phone behavior: the folder
  pane collapses, and list and message become separate views with a back
  button. The overridden templates therefore **keep the DOM hooks Elastic's
  responsive JS needs**: layout IDs and classes, header and back-button
  slots, toolbar containers.
- "Usable on a phone" for the first milestone means you can read, reply,
  delete and compose with Quiet's colors and no broken layout.
- A tailored phone design comes later and is not part of the first
  milestone.

## How it gets made

- **Quiet extends Elastic** (`"extends": "elastic"` in `meta.json`). It
  inherits Elastic's JS (popups, dialogs, keyboard handling, responsive
  switching) and overrides styles and the templates whose structure
  changes: mail, message/preview, compose and login, at least. It does not
  fork Elastic wholesale.
- **Dev environment on this box**, in Docker, not on the host:
  - the `roundcube/roundcubemail` image pinned to **1.6.10**, with
    `skins/quiet` bind-mounted from the repo so edits show on reload;
  - a throwaway IMAP/SMTP test server (e.g. GreenMail) seeded by a script
    with realistic sample mail: unread and read messages, attachments, long
    subjects, HTML and plain text, a few folders, and enough messages to
    scroll;
  - Compose files and the seed script live in this repo (e.g. `dev/`). The
    web UI is published on a host port so it can be viewed in a browser.
- **Install on production:** copy `skins/quiet` to the owner's Roundcube
  machine and select it. The builder writes a short install note in the
  README. Deploying to the owner's machine is the owner's step.

## Left to the builder

- Build tooling: plain CSS, or LESS compiled the way Elastic does. Keep the
  shipped skin self-contained (built CSS committed or produced by a
  documented step).
- How the hover actions are implemented. Skin JS hooked into
  `rcmail`/`rcube_list_widget` events is expected, with no core patches.
  Behavior must match the description above.
- The exact icon set. Use simple stroke icons in the mockups' style. Elastic's
  icon font may stay where it isn't visible in the redesigned screens.
- Dark-mode values marked "builder picks" in the token table.
- The test-server choice and the seed data details.

## Acceptance (what "done" means for the first milestone)

- Quiet is selectable in Settings on a stock 1.6.10 install and is used for
  login, mail, message view, compose, contacts and settings with no visual
  breakage and no console errors.
- Mail, open message, compose and login match the mockups' structure and
  button rules in **both** light and dark.
- Hover quick actions work with a single click and don't change the
  selection. Multi-select (click, Shift-click, Ctrl-click) moves the actions
  next to the folder title and shows the "N selected" empty state.
- With the archive plugin disabled, no Archive button appears anywhere.
- Checked by screenshots at desktop width in light and dark, plus a
  phone-width screenshot to show it stays usable.
