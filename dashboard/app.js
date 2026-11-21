// Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts from the
// same board board.json carries) and renders the ranked board, its filters, a detail view for
// every protocol on the board, and the live-token peers the model priced it against. No network:
// every byte it shows arrived in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;
  app.removeAttribute('aria-busy');

  var PAGE = 60;
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, sort: 'rank', dir: 1, showAll: false, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    return Math.max(0, Math.round(days)) + ' days';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(3); }
  // The model, recomputed in the page from the row's own figures and the stated constants: the
  // detail view shows this number beside board.json's, and they agree to the dollar.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * row.growth_factor * row.maturity_factor));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function esc(s) { return String(s === null || s === undefined ? '' : s); }

  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });
  var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;

  // ---------------------------------------------------------------- header and stats
  var mark = '<svg class="mark" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15.5" fill="none" stroke="#3ddc97" stroke-width="1.6" opacity="0.45"/><circle cx="17" cy="17" r="9.5" fill="none" stroke="#3ddc97" stroke-width="1.6" opacity="0.7"/><circle cx="17" cy="17" r="3.2" fill="#3ddc97"/><line x1="17" y1="17" x2="29" y2="6" stroke="#3ddc97" stroke-width="1.6"/></svg>';
  var header = el('div', { class: 'shell' });
  var top = el('div', { class: 'top' },
    el('div', { class: 'brand' }, el('span', { html: '' }), el('div', null,
      el('div', { class: 'brand-name', text: 'Launch Radar' }),
      el('div', { class: 'dim', text: 'token launch radar - model ' + DATA.model_version }))),
    el('div', { class: 'top-meta', text: 'snapshot ' + DATA.as_of + ' - no live data, nothing fetched' }));
  top.firstChild.firstChild.innerHTML = mark;
  header.appendChild(top);

  var totalImplied = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
  var lede = el('div', { class: 'lede' },
    el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
    el('p', null,
      'Every protocol in the sealed DefiLlama snapshot that records no token - and is not a wrapped, staked or bridged product of one that trades - ranked by ',
      el('b', { text: 'peer-anchored implied value' }),
      ': what its token would be worth if the market priced its TVL the way it already prices its category peers. Each row carries the farm plan to be holding it before launch.'));
  header.appendChild(lede);

  function stat(big, label, sub) {
    return el('div', { class: 'stat' }, el('b', { text: big }), el('span', { text: label }), sub ? el('span', { class: 'sub', text: sub }) : null);
  }
  var stats = el('div', { class: 'stats' },
    stat(String(DATA.protocol_size), 'protocols in the snapshot', 'every one at $5M+ TVL, as of ' + DATA.as_of),
    stat(String(DATA.watchlist_size) + ' / ' + String(DATA.watchlist_size), 'watchlist protocols covered', 'the house floor: $50M+ TVL, no token recorded'),
    stat(String(DATA.board_size), 'protocols ranked on the board', DATA.early_size + ' found early, below the floor'),
    stat(fmtUsd(totalImplied), 'combined implied launch value', 'median peer multiple ' + fmtMult(DATA.global_multiple) + ' across all categories'));
  header.appendChild(stats);

  // ---------------------------------------------------------------- the model, stated
  var m = DATA.model;
  var modelBox = el('section', { class: 'model', id: 'model' },
    el('h2', { text: 'The value model, stated in full' }),
    el('p', { text: 'No name is special-cased and no figure comes from outside the snapshot. For each category, the model takes every protocol whose token already trades, divides its market cap by its TVL, winsorises each ratio into [' + m.ratio_floor + ', ' + m.ratio_cap + '] so one mania cannot price a whole category, and blends the category median with the global median by peer count (weight n/(n+' + m.shrink_peers + ')). A protocol is then priced off its own three figures:' }),
    el('div', { class: 'formula', text: 'implied value = TVL x peer multiple (category) x growth factor x maturity factor' }),
    el('div', { class: 'model-cols' },
      el('div', null, el('h3', { text: 'The two adjustments' }),
        el('ul', null,
          el('li', null, el('b', { text: 'Growth factor ' }), document.createTextNode('= 1 + clamp(7-day TVL change, ' + m.growth_floor + '%, +' + m.growth_cap + '%) x ' + m.growth_weight + '. A protocol expanding into its launch is worth more than one shrinking toward it.')),
          el('li', null, el('b', { text: 'Maturity factor ' }), document.createTextNode('= ' + m.maturity_base + ' + ' + m.maturity_span + ' x min(age, ' + m.maturity_days + ' days) / ' + m.maturity_days + '. Years of operating with no token is evidence a launch, when it comes, is real. Unknown listing dates count as ' + m.unknown_age_days + ' days.')),
          el('li', null, el('b', { text: 'The band ' }), document.createTextNode('under each value is the same arithmetic at the category\u2019s lower and upper peer quartiles: a range the evidence supports, not a promise.')))),
      el('div', null, el('h3', { text: 'Peer multiples by category' }),
        el('table', { class: 'peer-table' },
          el('thead', null, el('tr', null,
            el('th', { text: 'Category' }), el('th', { text: 'Peers' }), el('th', { text: 'Multiple' }), el('th', { text: 'Band' }))),
          el('tbody', null, DATA.peers.slice(0, 10).map(function (p) {
            return el('tr', null,
              el('td', { text: p.category }), el('td', { text: String(p.peers) }),
              el('td', { text: fmtMult(p.multiple) }), el('td', { text: fmtMult(p.low) + ' - ' + fmtMult(p.high) }));
          }))))));
  header.appendChild(modelBox);
  app.appendChild(header);

  // ---------------------------------------------------------------- controls
  var shell2 = el('div', { class: 'shell' });
  shell2.style.paddingTop = '0';
  var categories = [];
  var chains = [];
  DATA.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort(); chains.sort();

  var qInput = el('input', { type: 'search', placeholder: 'Name or slug, e.g. morpho', 'aria-label': 'Search protocols' });
  qInput.addEventListener('input', function () { state.q = qInput.value.trim().toLowerCase(); state.showAll = false; render(); });
  var catSelect = el('select', { 'aria-label': 'Filter by category' }, el('option', { value: 'all', text: 'All categories' }),
    categories.map(function (c) { return el('option', { value: c, text: c }); }));
  catSelect.addEventListener('change', function () { state.category = catSelect.value; state.showAll = false; render(); });
  var chainSelect = el('select', { 'aria-label': 'Filter by chain' }, el('option', { value: 'all', text: 'All chains' }),
    chains.map(function (c) { return el('option', { value: c, text: c }); }));
  chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; state.showAll = false; render(); });
  var watchBox = el('input', { type: 'checkbox', 'aria-label': 'Watchlist only' });
  watchBox.addEventListener('change', function () { state.watchOnly = watchBox.checked; state.showAll = false; render(); });
  var count = el('div', { class: 'count' });
  var controls = el('div', { class: 'controls' },
    el('div', { class: 'field' }, el('label', { text: 'Search' }), qInput),
    el('div', { class: 'field' }, el('label', { text: 'Category' }), catSelect),
    el('div', { class: 'field' }, el('label', { text: 'Chain' }), chainSelect),
    el('label', { class: 'check' }, watchBox, document.createTextNode('Watchlist only')),
    count);
  shell2.appendChild(controls);

  // ---------------------------------------------------------------- the board
  var panel = el('section', { class: 'panel', id: 'board' });
  var wrap = el('div', { class: 'table-wrap' });
  var table = el('table', { class: 'board' });
  var tbody = el('tbody');
  var COLS = [
    { key: 'rank', label: 'Rank' }, { key: 'name', label: 'Protocol' }, { key: 'chains', label: 'Chains' },
    { key: 'tvl', label: 'TVL' }, { key: 'change', label: '7d %' }, { key: 'age', label: 'Age' },
    { key: 'mult', label: 'Peer x' }, { key: 'implied', label: 'Implied value' }, { key: 'conviction', label: 'Conviction' },
  ];
  var thead = el('thead', null, el('tr', null, COLS.map(function (c) {
    var th = el('th', { class: 'sortable', text: c.label });
    th.addEventListener('click', function () {
      if (state.sort === c.key) state.dir = -state.dir;
      else { state.sort = c.key; state.dir = c.key === 'rank' || c.key === 'name' ? 1 : -1; }
      render();
    });
    th.dataset.key = c.key;
    return th;
  })));
  table.appendChild(thead); table.appendChild(tbody); wrap.appendChild(table); panel.appendChild(wrap);
  var moreBtn = el('button', { class: 'more', text: 'Show the whole board' });
  moreBtn.addEventListener('click', function () { state.showAll = true; render(); });
  shell2.appendChild(panel);
  shell2.appendChild(moreBtn);
  var detailHost = el('div');
  shell2.appendChild(detailHost);

  // ---------------------------------------------------------------- the live peers
  var liveBox = el('section', { class: 'live' },
    el('h2', { text: 'Already trading - the peer evidence, never ranked' }),
    el('p', { text: 'These protocols\u2019 tokens exist, so the board does not rank them: it prices the pre-token board off what the market pays for their TVL. The largest by market cap:' }));
  var liveTable = el('table', { class: 'board' },
    el('thead', null, el('tr', null,
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'TVL' }),
      el('th', { text: 'Market cap' }), el('th', { text: 'Mcap / TVL' }), el('th', { text: '7d %' }))),
    el('tbody', null, DATA.live.map(function (r) {
      return el('tr', null,
        el('td', { class: 'name', text: r.name }), el('td', { class: 'dim', text: esc(r.category) || 'n/a' }),
        el('td', { text: fmtUsd(r.tvl_usd) }), el('td', { text: fmtUsd(r.mcap_usd) }),
        el('td', { text: r.mcap_tvl === null ? 'n/a' : fmtMult(r.mcap_tvl) }),
        el('td', { class: r.change_7d === null ? 'dim' : (r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }));
    })));
  var livePanel = el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, liveTable));
  liveBox.appendChild(livePanel);
  shell2.appendChild(liveBox);

  var foot = el('footer', null,
    el('p', { text: 'Source: ' + DATA.source + ' (sealed snapshot, as of ' + DATA.as_of + '). A protocol here records no token in that snapshot; that is DefiLlama\u2019s record, not proof none exists. Implied values are this entry\u2019s model output - a claim about what a launch would be worth if the record held, never a prediction that a token will be issued. Farm plans are research, not financial advice; positions in unaudited protocols can be lost in full.' }));
  shell2.appendChild(foot);
  app.appendChild(shell2);

  // ---------------------------------------------------------------- filtering and sorting
  function filtered() {
    var rows = DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q && r.name.toLowerCase().indexOf(state.q) < 0 && r.slug.indexOf(state.q) < 0) return false;
      return true;
    });
    var k = state.sort, d = state.dir;
    var val = function (r) {
      if (k === 'rank') return r.rank;
      if (k === 'name') return r.name.toLowerCase();
      if (k === 'chains') return r.chains.length;
      if (k === 'tvl') return r.tvl_usd;
      if (k === 'change') return r.change_7d === null ? -1e9 : r.change_7d;
      if (k === 'age') return r.age_days === null ? -1 : r.age_days;
      if (k === 'mult') return r.peer_multiple;
      if (k === 'conviction') return r.conviction;
      return r.implied_value_usd;
    };
    rows.sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -d; if (va > vb) return d;
      return a.rank - b.rank;
    });
    return rows;
  }

  function render() {
    var rows = filtered();
    count.textContent = rows.length + ' of ' + DATA.board_size + ' protocols';
    thead.querySelectorAll('th').forEach(function (th) {
      var base = th.dataset.key === 'name' ? 'Protocol' : th.textContent.replace(/ [v^]$/, '');
      th.textContent = base;
      if (th.dataset.key === state.sort) {
        var span = el('span', { class: 'dir', text: state.dir === 1 ? ' ^' : ' v' });
        th.appendChild(span);
      }
    });
    tbody.textContent = '';
    var shown = state.showAll ? rows : rows.slice(0, PAGE);
    shown.forEach(function (r) {
      var badge = r.on_watchlist
        ? el('span', { class: 'badge', text: 'WATCHLIST' })
        : el('span', { class: 'badge early', text: 'EARLY' });
      var nameCell = el('td', { class: 'name' }, document.createTextNode(r.name), badge,
        el('span', { class: 'cat', text: esc(r.category) || 'Uncategorised' }));
      var bar = el('div', { class: 'bar' }, el('i'));
      bar.firstChild.style.width = r.conviction + '%';
      var tr = el('tr', { tabindex: '0', 'aria-label': r.name + ' detail' },
        el('td', { text: '#' + r.rank }),
        nameCell,
        el('td', { class: 'dim', text: r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') }),
        el('td', { text: fmtUsd(r.tvl_usd) }),
        el('td', { class: r.change_7d === null ? 'dim' : (r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'dim', text: fmtAge(r.age_days) }),
        el('td', { text: fmtMult(r.peer_multiple) }),
        el('td', { text: fmtUsd(r.implied_value_usd) }),
        el('td', null, bar));
      tr.addEventListener('click', function () { select(r.slug, true); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.slug, true); } });
      tbody.appendChild(tr);
    });
    moreBtn.style.display = rows.length > PAGE && !state.showAll ? '' : 'none';
    moreBtn.textContent = 'Show all ' + rows.length + ' protocols';
    writeHash();
  }

  // ---------------------------------------------------------------- the detail view
  function select(slug, scroll) {
    state.selected = slug;
    renderDetail();
    writeHash();
    if (scroll) {
      var node = document.getElementById('detail');
      if (node) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
  function dstat(big, label) { return el('div', { class: 'd-stat' }, el('b', { text: big }), el('span', { text: label })); }
  function renderDetail() {
    detailHost.textContent = '';
    var r = state.selected ? bySlug[state.selected] : null;
    if (!r) return;
    var check = impliedOf(r);
    var peers = DATA.live.filter(function (x) { return x.category === r.category; }).slice(0, 4);
    function decompRow(k, v, widthPct, valText) {
      var bar = el('div', { class: 'bar' }, el('i'));
      bar.firstChild.style.width = Math.max(2, Math.min(100, widthPct)) + '%';
      return el('div', { class: 'decomp-row' }, el('span', { class: 'k', text: k }), bar, el('span', { class: 'v', text: valText }));
    }
    var box = el('section', { class: 'detail', id: 'detail' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('h2', null, document.createTextNode('#' + r.rank + ' ' + r.name),
            r.on_watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : el('span', { class: 'badge early', text: 'EARLY - BELOW THE FLOOR' })),
          el('p', { class: 'sub', text: (esc(r.category) || 'Uncategorised') + ' - ' + (r.chains.join(', ') || 'no chains recorded') + ' - records no token in the snapshot' })),
        el('button', { class: 'close', text: 'Close', onclick: function () { state.selected = null; renderDetail(); writeHash(); } })),
      el('div', { class: 'd-stats' },
        dstat(fmtUsd(r.implied_value_usd), 'implied launch value'),
        dstat(fmtUsd(r.tvl_usd), 'TVL in the snapshot'),
        dstat(fmtPct(r.change_7d), 'TVL change, 7 days'),
        dstat(String(r.conviction) + ' / 100', 'conviction (display only)')),
      el('h3', { text: 'How the value is derived' }),
      el('div', { class: 'decomp' },
        decompRow('TVL (snapshot)', r.tvl_usd, 100, fmtUsd(r.tvl_usd)),
        decompRow('x peer multiple, ' + (esc(r.category) || 'all categories'), r.tvl_usd * r.peer_multiple, 100 * r.peer_multiple / 4, fmtMult(r.peer_multiple) + ' (' + r.peer_count + (r.peer_count === 1 ? ' peer)' : ' peers)')),
        decompRow('x growth factor', r.tvl_usd * r.peer_multiple * r.growth_factor, 100 * r.growth_factor / 1.6, 'x' + r.growth_factor.toFixed(3)),
        decompRow('x maturity factor', r.tvl_usd * r.peer_multiple * r.growth_factor * r.maturity_factor, 100 * r.maturity_factor / 1.25, 'x' + r.maturity_factor.toFixed(3))),
      el('p', { class: 'band' },
        document.createTextNode('Implied value '), el('b', { text: fmtUsd(r.implied_value_usd) }),
        document.createTextNode(', supported band '), el('b', { text: fmtUsd(r.implied_low_usd) + ' - ' + fmtUsd(r.implied_high_usd) }),
        document.createTextNode(' at the peer quartiles. Recomputed in this page from the row\u2019s own figures: '),
        el('b', { text: fmtUsd(check) + (check === r.implied_value_usd ? ' - matches board.json exactly' : '') }),
        document.createTextNode('. Tracked by DefiLlama since ' + (r.listed_at || 'an unrecorded date') + ' (' + fmtAge(r.age_days) + '), across ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '.')),
      el('h3', { text: 'The farm plan' }),
      el('div', { class: 'steps' }, r.farm_steps.map(function (s, i) {
        return el('div', { class: 'step' },
          el('span', { class: 'n', text: String(i + 1) }),
          el('div', null,
            el('p', { text: s.action }),
            el('div', { class: 'meta' },
              el('span', { class: 'chip' }, el('b', { text: 'Cost ' }), document.createTextNode(s.cost)),
              el('span', { class: 'chip' }, el('b', { text: 'Time ' }), document.createTextNode(s.time)))));
      })),
      peers.length ? el('h3', { text: 'Peers in this category that already trade' }) : null,
      peers.length ? el('p', { class: 'peers-note', text: peers.map(function (x) { return x.name + ' (mcap/TVL ' + (x.mcap_tvl === null ? 'n/a' : fmtMult(x.mcap_tvl)) + ')'; }).join(' - ') + '. Their prices are the evidence behind the ' + fmtMult(r.peer_multiple) + ' multiple above.' }) : null);
    detailHost.appendChild(box);
  }

  // ---------------------------------------------------------------- hash routing
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) { state.q = params.get('q'); qInput.value = state.q; }
    if (params.get('category') && categories.indexOf(params.get('category')) >= 0) { state.category = params.get('category'); catSelect.value = state.category; }
    if (params.get('chain') && chains.indexOf(params.get('chain')) >= 0) { state.chain = params.get('chain'); chainSelect.value = state.chain; }
    if (params.get('watch') === '1') { state.watchOnly = true; watchBox.checked = true; }
    if (params.get('p') && bySlug[params.get('p')]) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('watch', '1');
    if (state.selected) params.set('p', state.selected);
    var h = params.toString();
    try { history.replaceState(null, '', h ? '#' + h : window.location.pathname); } catch (e) { /* file:// in some browsers */ }
  }

  readHash();
  render();
  renderDetail();
})();
