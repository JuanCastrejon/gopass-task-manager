# Tasks: SL-19 — Capa visual, tema claro/oscuro y fondo de tablero

## 1. Tema claro/oscuro

- [x] 1.1 Medir el contraste de los 45 tokens actuales y detectar los dos muertos (`brand-soft`, `status-todo-soft`, cero usos)
- [x] 1.2 Medir que derivar solo el fondo con `color-mix` falla los 18 pares (ratios 1,99 a 2,85) y que aclarar el texto al 50 % los aprueba todos con peor caso 5,85
- [x] 1.3 Redefinir los seis tokens estructurales bajo `[data-theme="dark"]` y derivar los 18 pares
- [x] 1.4 Script síncrono anti-parpadeo en el `<head>` de `web/index.html`
- [x] 1.5 Módulo `web/src/lib/theme.ts` con persistencia en `localStorage` y caída a `prefers-color-scheme`
- [x] 1.6 Conmutador `web/src/components/ui/ThemeToggle.tsx` con ciclo fijo de tres estados
- [x] 1.7 Dos tokens de foco con anillo doble y verificación de contraste sobre las tres superficies

## 2. Geometría y densidad

- [x] 2.1 Columnas de 272 px fijos con `shrink-0` y desplazamiento horizontal desde `lg`
- [x] 2.2 El tablero rompe el contenedor de 64rem, con relleno compensatorio solo al inicio
- [x] 2.3 Densidad de tarjeta, radios y sombras con los tokens del proyecto
- [x] 2.4 Verificación a tres anchos —1440, 1024 y 390— en los dos temas

## 3. Fondo de tablero por proyecto

- [x] 3.1 Migración `0011_fondo_de_tablero.sql` con `CHECK` de paleta cerrada en el motor
- [x] 3.2 Campo en el mapeador, Zod, Swagger y contrato
- [x] 3.3 Selección desde `ProjectFormDialog.tsx`, sin crear otro diálogo
- [x] 3.4 Aplicación a sangre y atenuación en tema oscuro
- [x] 3.5 Verificar en el DOM real que ningún texto queda apoyado sobre el degradado, en ambos temas

## 4. Pruebas

- [x] 4.1 Unitarias del módulo de tema y del conmutador, incluida la que exige que los tres estados sean alcanzables
- [x] 4.2 Pruebas de API del campo `background` y del `CHECK` del motor
- [x] 4.3 E2E de tema, geometría y fondo

## 5. Pendiente

- [ ] 5.1 ADR-031 (tema derivado con `color-mix` y ciclo fijo) en `docs/spec/04-arquitectura.md`
- [ ] 5.2 ADR-032 (fondo como identidad compartida frente al tema como preferencia local)
- [ ] 5.3 Mediciones de contraste en `docs/spec/08-verificacion-postgres.md`
- [ ] 5.4 Recuentos en `README.md` y `docs/spec/05-estrategia-calidad.md`
- [ ] 5.5 Issue enriquecido de 19 secciones y su PR
