/* eslint-disable react-refresh/only-export-components */
import { createRoot } from "react-dom/client";
import { Moon } from "lucide-react";

import "../../src/styles/index.css";
import "./visual.css";

import { galleryScenes, type GalleryTheme } from "./scenes";

declare global {
  interface Window {
    __JACI_GALLERY__: Array<{
      id: string;
      title: string;
      description: string;
      themes: GalleryTheme[];
      viewport: { width: number; height: number };
    }>;
  }
}

const params = new URLSearchParams(window.location.search);
const selectedSceneId = params.get("scene");
const requestedTheme = params.get("theme");
const selectedTheme: GalleryTheme = requestedTheme === "dark" ? "dark" : "light";

window.__JACI_GALLERY__ = galleryScenes.map(
  ({ id, title, description, themes, viewport }) => ({
    id,
    title,
    description,
    themes,
    viewport,
  }),
);

document.body.classList.toggle("dark-mode", selectedTheme === "dark");
document.documentElement.dataset.galleryTheme = selectedTheme;

function GalleryIndex() {
  return (
    <main className="gallery-index">
      <header className="gallery-index-heading">
        <span className="scene-eyebrow">Jaci UI</span>
        <h1>Galeria de captura</h1>
        <p>
          Composições editoriais de um design system inspirado nos ciclos da
          natureza.
        </p>
      </header>

      <section className="gallery-index-grid">
        {galleryScenes.map(scene => (
          <article className="gallery-index-card" key={scene.id}>
            <div>
              <span className="gallery-index-id">{scene.id}</span>
              <h2>{scene.title}</h2>
              <p>{scene.description}</p>
            </div>
            <div className="gallery-index-links">
              {scene.themes.map(theme => (
                <a
                  key={theme}
                  href={`?scene=${encodeURIComponent(scene.id)}&theme=${theme}`}
                >
                  {theme === "light" ? "Tema claro" : "Tema escuro"}
                </a>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function CaptureScene() {
  const scene = galleryScenes.find(item => item.id === selectedSceneId);

  if (!scene) {
    return (
      <main className="gallery-error">
        <strong>Cena não encontrada</strong>
        <a href="/visual/">Voltar para a galeria</a>
      </main>
    );
  }

  return (
    <main
      className="capture-canvas"
      data-capture-ready={scene.id}
      data-capture-theme={selectedTheme}
    >
      <div className="capture-decoration capture-decoration-one" />
      <div className="capture-decoration capture-decoration-two" />
      <div className="capture-content">{scene.render()}</div>
      <div className="capture-signature" aria-hidden="true">
        <Moon />
        <span>Jaci UI</span>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  selectedSceneId ? <CaptureScene /> : <GalleryIndex />,
);
