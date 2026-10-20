/**
 * Quiet: compose page (mockup ComposeDark).
 * Loaded after Elastic's ui.js but before rcmail.init() (which runs on DOM ready), so the
 * editor-init listener below is in place before the editor is created and runs after Elastic's own.
 */
(function () {
    'use strict';

    var $ = window.jQuery;
    var rc = window.rcmail;
    if (!$ || !rc || rc.env.action !== 'compose') return;

    // ---- TinyMCE formatting bar: a few buttons, everything else one click away ----
    // Nothing is dropped: buttons that are not in the slim bar (and buttons added by Roundcube plugins)
    // go into a second toolbar row that the "More" button shows, so the owner keeps alignment, fonts,
    // tables, source code, ...
    var KEEP = ['bold', 'italic', 'underline', 'bullist', 'numlist', 'link', 'image'];

    function slimToolbar(toolbar) {
        var tokens = String(toolbar || '').split(/\s+/).filter(Boolean);
        var hasPlain = tokens.indexOf('plaintext') >= 0;
        var rest = [];
        tokens.forEach(function (t) {
            if (t === 'plaintext' || KEEP.indexOf(t) >= 0) return;
            if (t !== '|' && rest.indexOf(t) >= 0) return;
            rest.push(t);
        });
        var restStr = rest.join(' ').replace(/(\|\s*)+/g, '| ').replace(/^\|\s*|\s*\|\s*$/g, '').trim();
        return {
            rest: restStr,
            // Elastic prefixes "plaintext |"; CSS moves that group to the right end.
            bar: (hasPlain ? 'plaintext | ' : '') + 'bold italic underline | bullist numlist | link image'
                + (restStr ? ' | quietmore' : '')
        };
    }

    // Stroke icons for TinyMCE's toolbar (replaces its filled glyphs; same 24px grid as the rest of the skin).
    // The inline style keeps skin CSS ("svg { fill: currentColor }") from filling the strokes.
    var ICONS = {
        'bold': "<path d='M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z'/>",
        'italic': "<path d='M10 5h8M6 19h8M14 5l-4 14'/>",
        'underline': "<path d='M7 4v7a5 5 0 0010 0V4M5 20h14'/>",
        'unordered-list': "<path d='M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1'/>",
        'ordered-list': "<path d='M10 6h10M10 12h10M10 18h10M5 4.5v4M4 8.5h2M4 13h2l-2 3h2M4 19h2v2H4'/>",
        'link': "<path d='M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'/>",
        'image': "<rect x='3' y='5' width='18' height='14' rx='2'/><circle cx='9' cy='10' r='1.5'/><path d='M21 16l-5-5-8 8'/>",
        'more-drawer': "<circle cx='5' cy='12' r='1.6' fill='currentColor' stroke='none'/><circle cx='12' cy='12' r='1.6' fill='currentColor' stroke='none'/><circle cx='19' cy='12' r='1.6' fill='currentColor' stroke='none'/>",
        'undo': "<path d='M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3'/>",
        'redo': "<path d='M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3'/>",
        'chevron-down': "<path d='M6 9l6 6 6-6'/>",
        // behind "More"
        'align-left': "<path d='M4 6h16M4 10h10M4 14h16M4 18h10'/>",
        'align-center': "<path d='M4 6h16M7 10h10M4 14h16M7 18h10'/>",
        'align-right': "<path d='M4 6h16M10 10h10M4 14h16M10 18h10'/>",
        'align-justify': "<path d='M4 6h16M4 10h16M4 14h16M4 18h16'/>",
        'indent': "<path d='M4 6h16M12 10h8M12 14h8M4 18h16M4 9l3 3-3 3'/>",
        'outdent': "<path d='M4 6h16M12 10h8M12 14h8M4 18h16M7 9l-3 3 3 3'/>",
        'ltr': "<path d='M10 4a4 4 0 000 8h1V4h3M14 4v14M10 4v14M4 19h14M15 16l3 3-3 3'/>",
        'rtl': "<path d='M14 4a4 4 0 010 8h-1V4h-3M10 4v14M14 4v14M20 19H6M9 16l-3 3 3 3'/>",
        'quote': "<path d='M5 18v-6a5 5 0 015-5M13 18v-6a5 5 0 015-5M5 12h5v6H5zM13 12h5v6h-5z'/>",
        'unlink': "<path d='M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1M4 4l16 16'/>",
        'table': "<rect x='3' y='5' width='18' height='14' rx='1'/><path d='M3 10h18M3 15h18M9 5v14M15 5v14'/>",
        'insert-character': "<path d='M6 19h4v-2.2A6 6 0 1115 8a6 6 0 00-1 8.8V19h4'/>",
        'embed': "<rect x='3' y='5' width='18' height='14' rx='2'/><path d='M10 9l5 3-5 3z'/>",
        'sourcecode': "<path d='M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14'/>",
        'search': "<circle cx='11' cy='11' r='6'/><path d='M16 16l5 5'/>"
    };

    function registerIcons(ed) {
        Object.keys(ICONS).forEach(function (name) {
            ed.ui.registry.addIcon(name, "<svg width='24' height='24' viewBox='0 0 24 24' style='fill:none;stroke:currentColor;stroke-width:1.8'>"
                + ICONS[name] + '</svg>');
        });
    }

    rc.addEventListener('editor-init', function (o) {
        var cfg = o.config;
        if (!cfg || o.id !== rc.env.composebody) return;
        var slim = slimToolbar(cfg.toolbar);
        cfg.toolbar = slim.rest ? [slim.bar, slim.rest] : slim.bar;
        var prev = cfg.setup_callback;
        cfg.setup_callback = function (ed) {
            if (prev) prev(ed);
            registerIcons(ed);
            if (!slim.rest) return;
            ed.ui.registry.addToggleButton('quietmore', {
                icon: 'more-drawer',
                tooltip: rc.get_label('more'),
                onAction: function (api) {
                    var on = !api.isActive();
                    $(ed.getContainer()).toggleClass('quiet-more-open', on);
                    api.setActive(on);
                },
                onSetup: function (api) {
                    api.setActive($(ed.getContainer()).hasClass('quiet-more-open'));
                }
            });
        };
    });

    // ---- the rest needs the DOM and rcmail's init ----
    function initFolders() {
        var ul = document.getElementById('quiet-compose-folderlist');
        var src = document.getElementById('quiet-folder-source');
        if (!ul || !src) return;
        Array.prototype.forEach.call(src.options, function (opt) {
            if (!opt.value) return; // "- don't save -"
            var text = opt.textContent.replace(/^[\s ]+/, '');
            var lead = (opt.textContent.match(/^[\s ]*/) || [''])[0].length;
            var li = document.createElement('li');
            li.className = 'mailbox';
            li.style.setProperty('--quiet-depth', Math.floor(lead / 4));
            var a = document.createElement('a');
            a.href = rc.url('mail', { _mbox: opt.value });
            a.textContent = text;
            a.addEventListener('click', function (e) {
                e.preventDefault();
                // goes through Roundcube's "discard unsent changes?" check
                rc.command('list', opt.value, a, e);
            });
            li.appendChild(a);
            ul.appendChild(li);
        });
        src.parentNode.removeChild(src);
    }

    // Cc / Bcc / Reply-To / Followup-To links in the To row (what Elastic's headers popup does).
    function initHeaderLinks() {
        var links = $('.quiet-addhdr');
        var sync = function () {
            links.each(function () {
                var shown = !$('#compose_' + $(this).data('target')).hasClass('hidden');
                $(this).toggleClass('quiet-gone', shown);
            });
        };
        links.on('click', function (e) {
            e.preventDefault();
            $('#compose_' + $(this).data('target')).removeClass('hidden').find('.recipient-input input').first().focus();
            sync();
        });
        var headers = document.querySelector('.compose-headers');
        if (headers && window.MutationObserver) {
            new MutationObserver(sync).observe(headers, { subtree: true, attributes: true, attributeFilter: ['class'] });
        }
        sync();
    }

    // Options popover: Elastic's right-hand sidebar, shown as a card under the Options button on desktop.
    function initOptions() {
        var btn = document.getElementById('quiet-options-button');
        var pop = document.getElementById('layout-sidebar');
        if (!btn || !pop) return;

        function close(refocus) {
            if (!pop.classList.contains('quiet-open')) return;
            pop.classList.remove('quiet-open');
            btn.setAttribute('aria-expanded', 'false');
            if (refocus) btn.focus();
        }

        function open() {
            var r = btn.getBoundingClientRect();
            pop.style.top = Math.round(r.bottom + 6) + 'px';
            pop.style.right = Math.max(8, Math.round(window.innerWidth - r.right - 8)) + 'px';
            // The visible editor type select follows the real editor mode
            // (Roundcube keeps the hidden #editor-selector in sync synchronously; the editor object itself lags)
            $('#quiet-editor-type').val($('#editor-selector').val() || 'plain');
            pop.classList.add('quiet-open');
            btn.setAttribute('aria-expanded', 'true');
            var first = pop.querySelector('select, input');
            if (first) first.focus();
        }

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (pop.classList.contains('quiet-open')) close(false); else open();
        });
        // Switching the editor type hands the focus to the new editor; the popover has done its job.
        $('#quiet-editor-type').on('change', function () { close(false); });
        document.addEventListener('click', function (e) {
            if (!pop.classList.contains('quiet-open')) return;
            if (pop.contains(e.target) || btn.contains(e.target)) return;
            close(false);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && pop.classList.contains('quiet-open')) close(true);
        });
    }

    // The labelled HTML / Plain text switch in the formatting bar follows the real editor mode
    // (the Options popover select and Roundcube's own toggle change it too, and a refused conversion reverts it).
    function initTypeSwitch() {
        var sw = document.getElementById('quiet-bar-type');
        if (!sw) return;
        var name = rc.get_label('editortype');
        sw.setAttribute('aria-label', name);
        sw.setAttribute('title', name);
        var sync = function () {
            var v = $('#editor-selector').val() || 'plain';
            $('#quiet-bar-type, #quiet-editor-type').val(v);
        };
        rc.addEventListener('actionafter', function (args) {
            if (args && args.action === 'toggle-editor') sync();
        });
        sync();
    }

    rc.addEventListener('init', function () {
        initTypeSwitch();
        initFolders();
        initHeaderLinks();
        initOptions();
    });
})();
