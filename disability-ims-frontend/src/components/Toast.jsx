import { useUI } from '../context/UIContext.jsx';

// App-wide confirmation toast, driven by UIContext.say().
export default function Toast() {
  const { toast } = useUI();
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      ✓ {toast}
    </div>
  );
}
