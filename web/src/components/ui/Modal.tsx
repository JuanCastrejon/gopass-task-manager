import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Diálogo modal sobre el elemento nativo `<dialog>`.
 *
 * `showModal()` da gratis lo que cuesta caro hacer bien a mano: coloca el
 * diálogo en la capa superior, vuelve inerte el resto de la página, atrapa el
 * foco, cierra con `Escape` y devuelve el foco al disparador. Se descartó
 * `@radix-ui/react-dialog` no por calidad —es excelente— sino porque aquí no
 * compra nada que el navegador no traiga ya.
 *
 * Lo que sí hay que añadir: sincronizar `open` con el ciclo de vida de React,
 * cancelar el `Escape` nativo para que el cierre pase por `onClose` (y el
 * estado de React no quede desincronizado), y cerrar al pulsar el fondo.
 */
export function Modal({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Identificador único por instancia. Con un `id` fijo, varias tarjetas con
  // su propio diálogo dejarían el documento lleno de `modal-title` repetidos y
  // `aria-labelledby` resolvería siempre al primero.
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // `autoFocus` de React no sirve aquí: React lo aplica al montar el
      // elemento, y en ese momento el diálogo todavía no se ha mostrado, así
      // que el navegador vuelve a decidir el foco al llamar a `showModal()`.
      // Se marca el destino con `data-autofocus` y se enfoca después.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Sin esto, `Escape` cierra el diálogo por su cuenta y React sigue
        // creyendo que está abierto.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // El diálogo no tiene padding propio: todo el contenido vive en el
        // div interior. Por eso un clic cuyo destino sea el propio `<dialog>`
        // solo puede venir del fondo.
        if (event.target === ref.current) onClose();
      }}
      /**
       * `dvh` y no `vh`: en un móvil real la barra del navegador se encoge al
       * hacer scroll y `vh` se queda con el alto grande, así que el pie del
       * diálogo cae fuera de la pantalla.
       *
       * Columna flex con el cuerpo desplazable: sin esto scrollea el diálogo
       * entero y el título se va con él. Medido a 844x390 —un móvil en
       * horizontal—, donde el formulario de tarea no cabe.
       *
       * `open:flex` y no `flex` a secas: un `<dialog>` cerrado se oculta con
       * el `display: none` de la hoja del navegador, y declarar `display`
       * incondicionalmente lo anula. Con `flex`, los diálogos cerrados de la
       * página seguían existiendo y `getByRole('dialog')` encontraba dos. Lo
       * cazó el E2E del conflicto de borrado.
       */
      className="m-auto open:flex max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] flex-col
                 rounded-xl border border-border bg-surface p-0 text-ink shadow-xl
                 backdrop:bg-ink/40"
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-m-1 rounded-md p-1 text-ink-muted transition hover:bg-canvas hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
}
