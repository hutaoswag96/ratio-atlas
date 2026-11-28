'use strict';
/* 口径说明：默认只在标题旁留一个 ?，悬停或点击才浮出说明，不占版面 */
function moreNote(text, label) {
 return '<button type="button" class="note-mark" aria-expanded="false" aria-label="展开说明" title="展开说明" data-note="' +
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') +
  '">' + (label || '?') + '</button>';
}

(function () {
 let pinned = null;
 const opened = () => [...document.querySelectorAll('.note-mark[aria-expanded="true"]')];

 function bodyOf(mark) {
  const id = mark.getAttribute('aria-controls');
  let body = id ? document.getElementById(id) : null;
  if (!body) {
   const next = mark.nextElementSibling;
   if (next && next.classList.contains('note-body')) body = next;
  }
  if (!body) {
   body = document.createElement('span');
   body.className = 'note-body';
   body.innerHTML = mark.dataset.note || '';
   body.hidden = true;
   mark.after(body);
  }
  if (!mark.closest('.hint')) {
   const wrap = document.createElement('span');
   wrap.className = 'hint';
   mark.parentNode.insertBefore(wrap, mark);
   wrap.appendChild(mark);
   if (body.parentNode !== wrap) wrap.appendChild(body);
  }
  return body;
 }

 function open(mark) {
  if (!mark) return;
  const body = bodyOf(mark);
  body.hidden = false;
  mark.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
   body.classList.remove('flip');
   const box = body.getBoundingClientRect();
   if (box.right > window.innerWidth - 12) body.classList.add('flip');
  });
 }

 function close(mark) {
  if (!mark) return;
  const body = bodyOf(mark);
  body.hidden = true;
  body.classList.remove('flip');
  mark.setAttribute('aria-expanded', 'false');
  if (pinned === mark) pinned = null;
 }

 function closeAll() {
  for (const mark of opened()) close(mark);
  pinned = null;
 }

 document.addEventListener('pointerover', event => {
  if (event.pointerType === 'touch') return;
  const mark = event.target.closest('.note-mark');
  if (!mark || pinned === mark) return;
  open(mark);
 });

 document.addEventListener('pointerout', event => {
  const mark = event.target.closest('.note-mark');
  if (!mark || pinned === mark) return;
  const hint = mark.closest('.hint');
  if (event.relatedTarget && hint && hint.contains(event.relatedTarget)) return;
  close(mark);
 });

 document.addEventListener('click', event => {
  const mark = event.target.closest('.note-mark');
  if (!mark) {
   if (pinned) closeAll();
   return;
  }
  event.preventDefault();
  if (mark.getAttribute('aria-expanded') === 'true' && pinned === mark) { close(mark); return; }
  for (const other of opened()) if (other !== mark) close(other);
  pinned = mark;
  open(mark);
 });

 document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAll();
 });
})();
