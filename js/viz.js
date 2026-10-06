/* Viz — 의존성 없는 초경량 SVG 차트 (index.html 에서 분리 · ④ 아키텍처 ㊿+134) */
/* ==================================================================
   Viz — 의존성 없는 초경량 SVG 차트 (dataviz 마크 규격 준수)
   · 얇은 마크 / 2px 선 / 데이터 끝 4px 라운드 / 채움 사이 2px 서피스 간격
   · 크로스헤어 + 툴팁 기본 제공 / 그리드·축은 후퇴
   ================================================================== */
export var Viz = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  function s(t, a) { var e = document.createElementNS(NS, t); for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]); return e; }
  function cv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function hexA(hex, a) {
    hex = (hex || '#000').trim().replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function niceNum(x) {
    if (x <= 0) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * e;
  }

  /* ---------- 공통 프레임 ---------- */
  function frame(host, cfg) {
    host.innerHTML = '';
    var W = host.clientWidth || 600, H = host.clientHeight || 260;
    var pad = { l: cfg.padL != null ? cfg.padL : 54, r: 14, t: 12, b: 26 };
    var iw = Math.max(10, W - pad.l - pad.r), ih = Math.max(10, H - pad.t - pad.b);
    var root = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    root.style.display = 'block';
    /* ㊿+141 접근성: 차트 이름(카드 제목) — 화면 낭독기가 «이미지»가 아니라 «채널별 임대중 차트»로 읽음 */
    var lbl = cfg.label || host.getAttribute('aria-label') || (function () { var c = host.closest && host.closest('.card,section,.pr-card,.eqd-card'); var h = c && c.querySelector('h2,h3,h4,.ttl'); return h ? h.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : ''; })();
    root.setAttribute('aria-label', (lbl || '차트') + (/차트|그래프|추이/.test(lbl) ? '' : ' 차트'));
    host.appendChild(root);
    var tip = document.createElement('div');
    tip.className = 'viz-tip';
    host.appendChild(tip);
    return { root: root, W: W, H: H, pad: pad, iw: iw, ih: ih, tip: tip };
  }

  function yAxis(f, min, max, fmt) {
    var ticks = 4, step = niceNum((max - min) / ticks) || 1;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    if (hi === lo) hi = lo + step;
    var g = s('g', {});
    for (var v = lo; v <= hi + 1e-9; v += step) {
      var y = f.pad.t + f.ih - ((v - lo) / (hi - lo)) * f.ih;
      var isZero = Math.abs(v) < 1e-9;
      g.appendChild(s('line', {
        x1: f.pad.l, x2: f.pad.l + f.iw, y1: y, y2: y,
        stroke: isZero ? cv('--axis') : cv('--grid'), 'stroke-width': 1, 'shape-rendering': 'crispEdges'
      }));
      var t = s('text', { x: f.pad.l - 8, y: y + 3.5, 'text-anchor': 'end', fill: cv('--muted') });
      t.style.font = '10.5px system-ui,sans-serif';
      t.style.fontVariantNumeric = 'tabular-nums';
      t.textContent = fmt(v);
      g.appendChild(t);
    }
    f.root.appendChild(g);
    return { lo: lo, hi: hi, y: function (v) { return f.pad.t + f.ih - ((v - lo) / (hi - lo)) * f.ih; } };
  }

  function xLabels(f, labels) {
    var n = labels.length, band = f.iw / n;
    var maxLen = 0; labels.forEach(function (l) { maxLen = Math.max(maxLen, String(l).length); });
    var need = maxLen * 6.4 + 12;                 // 라벨 폭 추정 + 최소 여백
    var every = Math.max(1, Math.ceil(need / band));
    var g = s('g', {});
    for (var i = 0; i < n; i++) {
      if (i % every !== 0 && i !== n - 1) continue;
      var x = f.pad.l + band * (i + 0.5);
      if (i === n - 1 && n > 1 && (n - 1) % every !== 0 && x > f.pad.l + f.iw - 18) x = f.pad.l + f.iw - 4;
      var t = s('text', { x: x, y: f.pad.t + f.ih + 16, 'text-anchor': 'middle', fill: cv('--muted') });
      t.style.font = '10.5px system-ui,sans-serif';
      t.textContent = labels[i];
      g.appendChild(t);
    }
    f.root.appendChild(g);
    return band;
  }

  function tipHTML(label, items, fmt) {
    return '<div class="vt-t">' + String(label == null ? '' : label).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }) + '</div>' + items.map(function (it) {
      return '<div class="vt-r"><span class="vt-s" style="background:' + it.color + '"></span>' +
        '<span class="vt-n">' + String(it.name == null ? '' : it.name).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }) + '</span><span class="vt-v">' + fmt(it.value) + '</span></div>';
    }).join('');
  }
  function placeTip(f, tip, x) {
    var w = tip.offsetWidth, left = x + 14;
    if (left + w > f.W - 6) left = x - w - 14;
    if (left < 4) left = 4;
    tip.style.left = left + 'px';
    tip.style.top = Math.max(4, f.pad.t) + 'px';
  }

  /* ---------- 선 / 누적 영역 ---------- */
  function lines(host, cfg) {
    var f = frame(host, cfg);
    host.__viz = { type: cfg.stacked ? 'area' : 'lines', cfg: cfg };   // 리포트 담기용 원본 데이터
    var labels = cfg.labels, series = cfg.series, n = labels.length;
    if (!n || !series.length) return;
    var fmt = cfg.fmt || String;
    var tfmt = cfg.tipFmt || fmt;
    var stacked = !!cfg.stacked;

    var tops = [], base = new Array(n).fill(0);
    if (stacked) {
      series.forEach(function (sr) {
        var top = sr.data.map(function (v, i) { return base[i] + (v || 0); });
        tops.push({ sr: sr, top: top, bot: base.slice() });
        base = top;
      });
    } else {
      series.forEach(function (sr) { tops.push({ sr: sr, top: sr.data.map(function (v) { return v || 0; }), bot: new Array(n).fill(0) }); });
    }
    var max = 0, min = 0;
    tops.forEach(function (t) { t.top.forEach(function (v) { if (v > max) max = v; if (v < min) min = v; }); });
    if (max === 0 && min === 0) max = 1;

    var ax = yAxis(f, min, max, fmt);
    var band = xLabels(f, labels);
    var X = function (i) { return f.pad.l + band * (i + 0.5); };

    // 누적은 위에서 아래로 그려 겹침 순서를 자연스럽게
    tops.slice().reverse().forEach(function (t) {
      var col = t.sr.color;
      var dTop = t.top.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + ax.y(v).toFixed(1); }).join(' ');
      if (cfg.fill !== false) {
        var dBot = t.bot.map(function (v, i) { return 'L' + X(n - 1 - i).toFixed(1) + ' ' + ax.y(t.bot[n - 1 - i]).toFixed(1); }).join(' ');
        f.root.appendChild(s('path', { d: dTop + ' ' + dBot + ' Z', fill: hexA(col, 0.22), stroke: 'none' }));
      }
      // 채움 사이 2px 서피스 간격
      if (stacked && cfg.fill !== false) {
        f.root.appendChild(s('path', { d: dTop, fill: 'none', stroke: cv('--surface'), 'stroke-width': 3.5, 'stroke-linejoin': 'round' }));
      }
      f.root.appendChild(s('path', { d: dTop, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });

    /* 크로스헤어 + 마커 */
    var cross = s('line', { y1: f.pad.t, y2: f.pad.t + f.ih, stroke: cv('--axis'), 'stroke-width': 1, opacity: 0 });
    f.root.appendChild(cross);
    var marks = s('g', { opacity: 0 });
    var dots = tops.map(function (t) {
      var c = s('circle', { r: 4, fill: t.sr.color, stroke: cv('--surface'), 'stroke-width': 2 });
      marks.appendChild(c); return c;
    });
    f.root.appendChild(marks);

    var hit = s('rect', { x: f.pad.l, y: f.pad.t, width: f.iw, height: f.ih, fill: 'transparent' });
    f.root.appendChild(hit);
    hit.addEventListener('mousemove', function (ev) {
      var r = f.root.getBoundingClientRect();
      var i = Math.max(0, Math.min(n - 1, Math.floor((ev.clientX - r.left - f.pad.l) / band)));
      var x = X(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', 1);
      marks.setAttribute('opacity', 1);
      tops.forEach(function (t, k) { dots[k].setAttribute('cx', x); dots[k].setAttribute('cy', ax.y(t.top[i])); });
      var items = series.map(function (sr) { return { name: sr.label, color: sr.color, value: sr.data[i] || 0 }; }).reverse();
      if (series.length > 1) items.push({ name: '합계', color: 'transparent', value: series.reduce(function (a, sr) { return a + (sr.data[i] || 0); }, 0) });
      f.tip.innerHTML = tipHTML(labels[i], items, tfmt);
      f.tip.style.opacity = 1;
      placeTip(f, f.tip, x);
    });
    hit.addEventListener('mouseleave', function () {
      cross.setAttribute('opacity', 0); marks.setAttribute('opacity', 0); f.tip.style.opacity = 0;
    });
  }

  /* ---------- 세로 막대 (단일 / 발산) ---------- */
  function bars(host, cfg) {
    var f = frame(host, cfg);
    host.__viz = { type: 'bars', cfg: cfg };
    var labels = cfg.labels, series = cfg.series, n = labels.length;
    if (!n || !series.length) return;
    var fmt = cfg.fmt || String;
    var tfmt = cfg.tipFmt || fmt;

    var max = 0, min = 0;
    series.forEach(function (sr) { sr.data.forEach(function (v) { if (v > max) max = v; if (v < min) min = v; }); });
    if (max === 0 && min === 0) max = 1;

    var ax = yAxis(f, min, max, fmt);
    var band = xLabels(f, labels);
    var y0 = ax.y(0);
    var groups = cfg.diverging ? 1 : series.length;
    var bw = Math.min(cfg.maxBar || 34, Math.max(3, (band * 0.66) / groups - (groups > 1 ? 1 : 0)));

    series.forEach(function (sr, gi) {
      sr.data.forEach(function (v, i) {
        v = v || 0; if (v === 0) return;
        var cx = f.pad.l + band * (i + 0.5);
        var gi2 = cfg.diverging ? 0 : gi;
        var x = cx - (bw * groups + (groups - 1) * 2) / 2 + gi2 * (bw + 2);
        var yv = ax.y(v), top = Math.min(yv, y0), h = Math.abs(yv - y0);
        var r = Math.min(4, h, bw / 2), up = v >= 0;
        var d = up
          ? 'M' + x + ' ' + (top + h) + ' V' + (top + r) + ' Q' + x + ' ' + top + ' ' + (x + r) + ' ' + top +
            ' H' + (x + bw - r) + ' Q' + (x + bw) + ' ' + top + ' ' + (x + bw) + ' ' + (top + r) + ' V' + (top + h) + ' Z'
          : 'M' + x + ' ' + top + ' V' + (top + h - r) + ' Q' + x + ' ' + (top + h) + ' ' + (x + r) + ' ' + (top + h) +
            ' H' + (x + bw - r) + ' Q' + (x + bw) + ' ' + (top + h) + ' ' + (x + bw) + ' ' + (top + h - r) + ' V' + top + ' Z';
        var p = s('path', { d: d, fill: sr.colorAt ? sr.colorAt(i) : sr.color, stroke: cv('--surface'), 'stroke-width': 1 });
        p.style.cursor = 'default';
        p.addEventListener('mouseenter', function () {
          p.setAttribute('opacity', .82);
          var items = series.map(function (s2) { return { name: s2.label, color: s2.colorAt ? s2.colorAt(i) : s2.color, value: s2.data[i] || 0 }; });
          f.tip.innerHTML = tipHTML(labels[i], items, tfmt) + (cfg.extra ? cfg.extra(i) : '');
          f.tip.style.opacity = 1; placeTip(f, f.tip, cx);
        });
        p.addEventListener('mouseleave', function () { p.removeAttribute('opacity'); f.tip.style.opacity = 0; });
        f.root.appendChild(p);
      });
    });
  }

  return {
    lines: lines,
    bars: bars,
    area: function (h, c) { c.stacked = true; c.fill = true; lines(h, c); },
    hexA: hexA
  };
})();

