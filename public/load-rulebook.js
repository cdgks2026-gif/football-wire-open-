(async () => {
  try {
    const response = await fetch('/api/rulebook', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unavailable');
    window.RULEBOOK = await response.json();
    const script = document.createElement('script');
    script.src = '/app.js?v=20261005-2134';
    document.body.appendChild(script);
  } catch {
    document.querySelector('#content').textContent = '暂时无法读取规则，请刷新页面重试。';
  }
})();
