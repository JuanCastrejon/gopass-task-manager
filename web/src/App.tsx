import { useEffect, useRef } from 'react';
import { CheckSquare } from 'lucide-react';
import { Link, useRoute } from './lib/router.tsx';
import { ThemeToggle } from './components/ui/ThemeToggle.tsx';
import { ProjectsPage } from './features/projects/ProjectsPage.tsx';
import { ProjectDetailPage } from './features/projects/ProjectDetailPage.tsx';

export function App() {
  const route = useRoute();
  const main = useRef<HTMLElement>(null);
  // Extraída de la lista de dependencias: una expresión compleja ahí no se
  // puede comprobar estáticamente, y el linter tiene razón en avisarlo.
  const vistaActual = route.name === 'projectDetail' ? `detalle:${route.projectId}` : 'lista';

  // Al cambiar de vista, el elemento que tenía el foco se desmonta y el foco
  // cae al `body`: quien navega con teclado tendría que tabular desde el
  // principio del documento. Se lleva al contenedor principal, que además es
  // el punto natural de lectura de la nueva pantalla.
  useEffect(() => {
    main.current?.focus();
  }, [vistaActual]);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <CheckSquare className="size-5 text-brand" aria-hidden />
            GoPass Task Manager
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main ref={main} tabIndex={-1} className="mx-auto max-w-5xl px-5 py-7 outline-none">
        {route.name === 'projects' ? (
          <ProjectsPage />
        ) : (
          <ProjectDetailPage projectId={route.projectId} />
        )}
      </main>
    </div>
  );
}
