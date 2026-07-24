import type { DragEvent } from 'react';

type Props = {
  dragging: boolean;
  setDragging: (value: boolean) => void;
  onDropFiles: (event: DragEvent<HTMLDivElement>) => void;
  onPickFiles: () => void;
  onLandingBrandClick: () => void;
};

export default function EmptyState({
  dragging,
  setDragging,
  onDropFiles,
  onPickFiles,
  onLandingBrandClick
}: Props) {
  return (
    <>
      <header className="topbar">
        <h1>乐签 TuneTag</h1>
      </header>
      <main className="empty-main">
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={onDropFiles}
        >
          <div className="drop-card">
            <div className="drop-icon">📁</div>
            <h2>音乐标签修改大师</h2>
            <p>拖入媒体文件或文件夹开始工作</p>
            <button className="primary" onClick={onPickFiles}>
              选择文件
            </button>
          </div>
        </div>
        <div className="hint-row">
          <span>支持 MP3 / FLAC / WAV / M4A</span>
          <span>支持批量导入</span>
        </div>
        <button type="button" className="landing-brand-link" onClick={onLandingBrandClick}>
          奇趣实验室 X 风声 联合出品
        </button>
      </main>
    </>
  );
}
