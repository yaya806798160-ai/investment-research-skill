/**
 * 轻量 SVG 环形图（无外部依赖）
 */
'use strict';
function donutChart(el, data) {
  const size = 180, stroke = 26, r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const total = data.reduce((s, d) => s + d.value, 0);
  const C = 2 * Math.PI * r;
  let offset = 0;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  // 背景圈
  const bg = document.createElementNS(ns, 'circle');
  bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', r);
  bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', '#1a2233'); bg.setAttribute('stroke-width', stroke);
  svg.appendChild(bg);
  data.forEach(function (d) {
    const frac = d.value / total;
    const len = frac * C;
    const arc = document.createElementNS(ns, 'circle');
    arc.setAttribute('cx', cx); arc.setAttribute('cy', cy); arc.setAttribute('r', r);
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', d.color);
    arc.setAttribute('stroke-width', stroke);
    arc.setAttribute('stroke-dasharray', len + ' ' + (C - len));
    arc.setAttribute('stroke-dashoffset', -offset);
    arc.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
    svg.appendChild(arc);
    offset += len;
  });
  el.innerHTML = '';
  el.appendChild(svg);
}