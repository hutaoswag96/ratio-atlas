'use strict';
/* 折叠说明：正文只留结论与数字，解释放 ＊ 后面，点开才显示 */
function moreNote(text, label) {
 return '<button type="button" class="note-mark" aria-expanded="false" aria-label="展开说明" title="展开说明" data-note="' +
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') +
  '">' + (label || '＊') + '</button>';
}

document.addEventListener('click', event => {
 const mark = event.target.closest('.note-mark');
 if (!mark) return;
 event.preventDefault();
 const id = mark.getAttribute('aria-controls');
 let body = id ? document.getElementById(id) : null;
 if (!body) {
  const next = mark.nextElementSibling;
  body = next && next.classList.contains('note-body') ? next : null;
 }
 if (!body) {
  body = document.createElement('span');
  body.className = 'note-body';
  body.innerHTML = mark.dataset.note || '';
  mark.after(body);
 }
 const open = mark.getAttribute('aria-expanded') !== 'true';
 mark.setAttribute('aria-expanded', open ? 'true' : 'false');
 body.hidden = !open;
});

document.addEventListener('keydown', event => {
 if (event.key !== 'Escape') return;
 for (const mark of document.querySelectorAll('.note-mark[aria-expanded="true"]')) {
  const id = mark.getAttribute('aria-controls');
  const body = id ? document.getElementById(id) : mark.nextElementSibling;
  mark.setAttribute('aria-expanded', 'false');
  if (body && body.classList.contains('note-body')) body.hidden = true;
 }
});
