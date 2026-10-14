import { useState, type FormEvent, type ReactNode } from 'react';
import './PasswordGate.css';

// 進入密碼：只存 SHA-256 雜湊值，不存明碼。
// 要換密碼：把新密碼的 SHA-256（小寫 16 進位）貼到這裡。
const PASSWORD_HASH = 'dcdbb6aef457346f7fb3629e367a4917098e490397e866d3b18c701d1e4a5604';
// 同一個瀏覽器通過後記住的天數
const REMEMBER_DAYS = 7;
const STORAGE_KEY = 'control-sim-unlock';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function isRemembered(): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return saved?.hash === PASSWORD_HASH && Date.now() < saved.until;
  } catch {
    return false;
  }
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isRemembered);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  if (unlocked) return <>{children}</>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ((await sha256(input)) !== PASSWORD_HASH) {
      setError(true);
      setInput('');
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hash: PASSWORD_HASH, until: Date.now() + REMEMBER_DAYS * 86400000 }),
      );
    } catch {
      // 無法記住時，這次仍可進入
    }
    setUnlocked(true);
  };

  return (
    <div className="gate">
      <form className="gate-box" onSubmit={submit}>
        <h1>控制系統模擬器</h1>
        <label htmlFor="gate-pw">請輸入密碼</label>
        <input
          id="gate-pw"
          type="password"
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(false);
          }}
        />
        {error && <div className="gate-error">密碼錯誤，請再試一次</div>}
        <button type="submit" className="primary">進入</button>
      </form>
    </div>
  );
}
