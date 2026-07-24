type Props = {
  show: boolean;
  pendingName: string;
  setPendingName: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export default function PresetNameModal({ show, pendingName, setPendingName, onSave, onClose }: Props) {
  if (!show) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h4>保存批量预设</h4>
        <p>请输入预设名称</p>
        <input
          type="text"
          autoFocus
          value={pendingName}
          onChange={(e) => setPendingName(e.target.value)}
          maxLength={32}
          placeholder="例如：电音专辑标准化"
        />
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="primary" onClick={onSave}>
            确认保存
          </button>
        </div>
      </div>
    </div>
  );
}
