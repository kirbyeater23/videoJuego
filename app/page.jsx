'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';

const initialHud = {
  sceneName: 'EMPATIA',
  clock: '07:00',
  notification: '',
  completed: 0,
  missed: 0,
  titleActive: true,
};

export default function Home() {
  const [hud, setHud] = useState(initialHud);

  useEffect(() => {
    window.GameUI = {
      setScene: sceneName => setHud(prev => ({ ...prev, sceneName: sceneName || 'EMPATIA' })),
      setTitleActive: active => setHud(prev => ({ ...prev, titleActive: !!active })),
      setClock: clock => setHud(prev => ({ ...prev, clock })),
      setTasks: ({ completed, missed }) => setHud(prev => ({ ...prev, completed, missed })),
      setNotification: text => setHud(prev => ({ ...prev, notification: text || '' })),
      clearNotification: () => setHud(prev => ({ ...prev, notification: '' })),
      fadeToBlack: () => {},
      fadeFromBlack: () => {},
    };

    return () => {
      window.GameUI = null;
    };
  }, []);

  return (
    <main className="game-shell">
      <canvas id="c" />
      <section className={`react-hud${hud.titleActive ? ' is-title' : ''}`}>
        <div className="hud-asset tasks-paper">
          <div className="tasks-lines">
            <div>hechas {hud.completed}</div>
            <div>faltan {hud.missed}</div>
            <div>{hud.sceneName}</div>
          </div>
        </div>
        <div className="hud-asset clock-object">
          <div className="clock-text">{hud.clock}</div>
        </div>
        {hud.notification ? <div className="notice">{hud.notification}</div> : null}
        <div className="hint-chip">A / D para moverte · clic para interactuar</div>
      </section>
      <Script src="/js/game.js" strategy="afterInteractive" />
    </main>
  );
}
