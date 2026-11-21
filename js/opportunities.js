(() => {
  const root = document.querySelector('#opportunity-list');
  const search = document.querySelector('#opportunity-search');
  const count = document.querySelector('#results-count');
  const buttons = [...document.querySelectorAll('[data-status]')];
  if (!root || !window.ylnOpportunities) return;
  let selected = 'all';
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render() {
    const query = (search.value || '').trim().toLowerCase();
    const all = window.ylnOpportunities;
    const visible = all.filter(item => {
      const resource = item.category.toLowerCase().includes('resource');
      const statusOK = selected === 'all' || (selected === 'resource' ? resource : selected === 'Closed' ? ['Closed','Past event'].includes(item.status) : item.status === selected);
      return statusOK && (!query || Object.values(item).join(' ').toLowerCase().includes(query));
    });
    root.innerHTML = visible.map((item, index) => `<article class="card opportunity-card"><div class="opportunity-card-top"><span class="category">${esc(item.category)}</span><span class="status status-${esc(item.status.toLowerCase().replace(/[^a-z]+/g,'-'))}">${esc(item.status)}</span></div><h2>${esc(item.title)}</h2><p>${esc(item.description)}</p><p class="opportunity-meta"><strong>${esc(item.organizer)}</strong><br>${esc(item.location)} · ${esc(item.date)}</p><details><summary>Eligibility, funding & application details</summary><dl><dt>Eligibility</dt><dd>${esc(item.eligibility)}</dd><dt>Funding / costs</dt><dd>${esc(item.funding)}</dd><dt>Application / notes</dt><dd>${esc(item.requirements)}</dd><dt>Deadline</dt><dd>${esc(item.deadline)}</dd></dl></details><div class="card-bottom">${item.link ? `<a class="button small" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Visit official page <span aria-hidden="true">↗</span></a>` : '<span class="status">Resource link to be added</span>'}</div></article>`).join('');
    count.textContent = `${visible.length} of ${all.length} listings`;
    document.querySelector('[data-count="all"]').textContent = `(${all.length})`;
    if (!visible.length) root.innerHTML = '<p class="empty-state">No listings match this search. Try another word or select a different status.</p>';
  }
  buttons.forEach(button => button.addEventListener('click', () => { selected = button.dataset.status; buttons.forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); render(); }));
  search.addEventListener('input', render);
  render();
})();
