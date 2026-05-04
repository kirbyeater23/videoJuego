'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

const initialHud = {
  sceneName: 'EMPATIA',
  clock: '07:00',
  notification: '',
  currentTasks: [],
  completedTasks: [],
  missedTasks: [],
  titleActive: true,
};

export default function Home() {
  const [hud, setHud] = useState(initialHud);
  const [displayNotification, setDisplayNotification] = useState('');
  const noticeTweenRef = useRef(null);

  useEffect(() => {
    window.GameUI = {
      setScene: sceneName => setHud(prev => ({ ...prev, sceneName: sceneName || 'EMPATIA' })),
      setTitleActive: active => setHud(prev => ({ ...prev, titleActive: !!active })),
      setClock: clock => setHud(prev => ({ ...prev, clock })),
      setTasks: ({ current = [], completed = [], missed = [] }) => setHud(prev => ({
        ...prev,
        currentTasks: current,
        completedTasks: completed,
        missedTasks: missed,
      })),
      setNotification: text => setHud(prev => ({ ...prev, notification: text || '' })),
      clearNotification: () => setHud(prev => ({ ...prev, notification: '' })),
      fadeToBlack: () => {},
      fadeFromBlack: () => {},
    };

    return () => {
      window.GameUI = null;
    };
  }, []);

  useEffect(() => {
    if (noticeTweenRef.current) {
      noticeTweenRef.current.kill();
      noticeTweenRef.current = null;
    }
    if (!hud.notification) {
      setDisplayNotification('');
      return;
    }
    const gsap = window.gsap;
    if (!gsap) {
      setDisplayNotification(hud.notification);
      return;
    }
    const fullText = hud.notification;
    const cursor = { count: 0 };
    setDisplayNotification('');
    noticeTweenRef.current = gsap.to(cursor, {
      count: fullText.length,
      duration: Math.min(2.4, Math.max(0.55, fullText.length * 0.035)),
      ease: 'none',
      snap: { count: 1 },
      onUpdate: () => setDisplayNotification(fullText.slice(0, cursor.count)),
      onComplete: () => setDisplayNotification(fullText),
    });
  }, [hud.notification]);

  return (
    <main className="game-shell">
      <canvas id="c" />
      <section className={`react-hud${hud.titleActive ? ' is-title' : ''}`}>
        <div className="hud-asset tasks-paper">
          <img className="hud-img" src="/assets/img/objetos/tareas.png" alt="" />
          <div className="tasks-lines">
            <div className="tasks-title">Tareas</div>
            {hud.currentTasks.length ? (
              <div className="tasks-section">
                <div className="tasks-heading">Ahora</div>
                {hud.currentTasks.map((task, i) => <div className="tasks-item" key={`current-${i}-${task}`}>{task}</div>)}
              </div>
            ) : null}
            {hud.completedTasks.length ? (
              <div className="tasks-section">
                <div className="tasks-heading">Hechas</div>
                {hud.completedTasks.slice(-3).map((task, i) => <div className="tasks-item" key={`done-${i}-${task}`}>✓ {task}</div>)}
              </div>
            ) : null}
            {hud.missedTasks.length ? (
              <div className="tasks-section">
                <div className="tasks-heading">Faltan</div>
                {hud.missedTasks.slice(-4).map((task, i) => <div className="tasks-item" key={`missed-${i}-${task}`}>• {task}</div>)}
              </div>
            ) : null}
          </div>
        </div>
        <div className="hud-asset clock-object">
          <img className="hud-img" src="/assets/img/objetos/relojVacioContador.png" alt="" />
          <div className="clock-text">{hud.clock}</div>
        </div>
        {hud.notification ? <div className="notice"><span className="notice-text">{displayNotification}</span></div> : null}
        <div className="hint-chip">A / D para moverte · clic para interactuar</div>
      </section>
      <Script src="https://unpkg.com/gsap@3/dist/gsap.min.js" strategy="beforeInteractive" />
      <Script src="/js/game.js" strategy="afterInteractive" />
    </main>
  );
}
