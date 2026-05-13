---
title: Reunión del lunes — Diseño del sprint
tags: trabajo, diseño, urgente
notebook: Proyectos
date: 2026-05-11
---

## Puntos a tratar

- Revisar el diseño de la nueva pantalla de onboarding
- Definir los criterios de aceptación del sprint 12
- Asignar tareas al equipo

## Tareas pendientes

- [ ] Subir mockups a Figma
- [ ] Revisar feedback del cliente
- [x] Enviar agenda a todo el equipo
- [ ] Preparar demo para el viernes

## Notas del equipo

> "El flujo de registro necesita simplificarse — hay demasiados pasos antes de llegar al valor real."
> — Ana, Product Manager

### Decisiones tomadas

1. Reducir el onboarding a **3 pasos máximo**
2. El botón de CTA debe ser más prominente (`color: indigo-500`)
3. Eliminar el paso de verificación de email en el flujo inicial

## Código de ejemplo

```typescript
function calcularVelocidad(puntos: number, dias: number): number {
  return Math.round(puntos / dias);
}

const velocidad = calcularVelocidad(42, 10);
console.log(`Velocidad del sprint: ${velocidad} pts/día`);
```

## Tabla de tareas

| Tarea              | Responsable | Estado     | Fecha límite |
|--------------------|-------------|------------|--------------|
| Mockups Figma      | Laura       | En progreso| 2026-05-13   |
| Revisión feedback  | Carlos      | Pendiente  | 2026-05-14   |
| Demo viernes       | Todo el equipo | Pendiente | 2026-05-15  |

---

Próxima reunión: **miércoles a las 10:00**.
