import { useState } from 'react';
import { Shield } from 'lucide-react';
import { setServerUrl } from '@/lib/serverConfig';

interface Props {
  onConfigured: () => void;
}

export function ServerConfigScreen({ onConfigured }: Props) {
  const [ip, setIp]         = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!ip.trim()) {
      setError("Veuillez saisir l'adresse IP du serveur");
      return;
    }

    const url = ip.trim().startsWith('http') ? ip.trim() : `https://${ip.trim()}`;
    setLoading(true);

    try {
      const res = await fetch(`${url}/api/health/ping`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error('non-ok');
      setServerUrl(url);
      onConfigured();
    } catch {
      setError("Impossible de joindre le serveur — vérifiez l'IP et la connexion Ethernet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#020408',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '"JetBrains Mono", "Courier New", monospace',
    }}>
      {/* Grille de fond */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      <div style={{ width: '100%', maxWidth: '420px', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '12px' }}>
            <Shield size={48} color="#00D4FF" />
            <span style={{
              position: 'absolute', top: 0, right: '-4px',
              width: '8px', height: '8px', borderRadius: '50%',
              background: '#00FF88', display: 'block',
            }} />
          </div>
          <div style={{
            fontSize: '20px', fontWeight: 'bold',
            letterSpacing: '0.35em', textTransform: 'uppercase',
            color: '#E8F4FD',
          }}>
            NINKI <span style={{ color: '#00D4FF' }}>GATEWAY</span>
          </div>
          <div style={{
            fontSize: '10px', letterSpacing: '0.3em',
            textTransform: 'uppercase', color: '#7A9CC0',
            marginTop: '6px',
          }}>
            Configuration du poste de commandement
          </div>
        </div>

        {/* Carte formulaire */}
        <div style={{
          background: 'rgba(8,12,24,0.9)',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: '2px',
          padding: '28px',
          boxShadow: '0 0 30px rgba(0,212,255,0.08)',
        }}>
          <div style={{
            fontSize: '11px', textTransform: 'uppercase',
            letterSpacing: '0.22em', color: '#7A9CC0',
            marginBottom: '20px',
          }}>
            Adresse du serveur SBC
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block', fontSize: '9px',
                textTransform: 'uppercase', letterSpacing: '0.15em',
                color: '#7A9CC0', marginBottom: '8px',
              }}>
                Adresse IP ou URL du serveur
              </label>
              <input
                type="text"
                value={ip}
                onChange={e => setIp(e.target.value)}
                placeholder="192.168.1.33"
                disabled={loading}
                autoFocus
                style={{
                  width: '100%', padding: '12px',
                  background: 'rgba(5,8,15,0.8)',
                  border: '1px solid #1E3A5F',
                  borderRadius: '2px',
                  color: '#E8F4FD',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  letterSpacing: '0.05em',
                }}
                onFocus={e => (e.target.style.borderColor = '#00D4FF')}
                onBlur={e => (e.target.style.borderColor = '#1E3A5F')}
              />
              <div style={{
                fontSize: '10px', color: '#3A5070',
                marginTop: '6px', letterSpacing: '0.05em',
              }}>
                Exemple : 192.168.1.33 ou https://192.168.1.33
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(255,45,85,0.1)',
                border: '1px solid rgba(255,45,85,0.4)',
                borderRadius: '2px', padding: '10px',
                marginBottom: '16px',
                fontSize: '12px', color: '#FF2D55',
                letterSpacing: '0.03em',
              }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px',
                background: loading
                  ? 'rgba(15,22,41,0.8)'
                  : 'linear-gradient(90deg, #00D4FF, #0066FF)',
                border: 'none', borderRadius: '2px',
                color: loading ? '#7A9CC0' : '#020408',
                fontFamily: '"JetBrains Mono", monospace',
                fontWeight: 'bold', fontSize: '12px',
                letterSpacing: '0.2em', textTransform: 'uppercase',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.2s',
              }}
            >
              {loading ? 'Vérification…' : '▸ SE CONNECTER AU SERVEUR'}
            </button>
          </form>
        </div>

        <div style={{
          textAlign: 'center', marginTop: '16px',
          fontSize: '10px', color: '#2A4060',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Vérifiez que le câble Ethernet est branché
        </div>
      </div>
    </div>
  );
}
