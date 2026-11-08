import html2canvas from 'html2canvas';

export async function downloadPreview(view: unknown): Promise<void> {
  if (!(view instanceof HTMLElement)) throw Error('プレビューを表示してください。');
  const canvas = await html2canvas(view, {logging:false});
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'SpiderNest.png';
  document.body.append(link);
  link.click();
  link.remove();
}
