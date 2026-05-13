---
title: Ideas para la app móvil
tags: ideas, producto, móvil
notebook: Proyectos
date: 2026-05-01
---

## Concepto general

Una app de hábitos que usa **revisión semanal** en vez de racha diaria — menos presión, más reflexión.

## Features principales

### MVP

- [ ] Registro de hábitos con nombre + emoji
- [ ] Check-in semanal (domingo por la noche)
- [ ] Resumen visual de la semana pasada
- [ ] Notificación configurable

### Fase 2

- [ ] Estadísticas de tendencias por mes
- [ ] Modo compañero — compartes progreso con un amigo
- [ ] Widget para pantalla de inicio (iOS + Android)

## Inspiración de otras apps

| App | Qué me gusta | Qué no me gusta |
|-----|-------------|-----------------|
| Streaks | UI minimalista | Demasiado enfocada en racha |
| Habitica | Gamificación | Demasiado compleja |
| Loop | Open source, sin BS | UI anticuada |

## Stack técnico considerado

```
Frontend:  React Native + Expo
Backend:   Next.js (reusar el que ya tengo)
DB:        SQLite → PostgreSQL en producción
Auth:      Clerk o NextAuth
```

## Pregunta clave

> ¿La gente quiere *presión diaria* o *reflexión semanal*? Validar antes de construir.

---

Próximo paso: hacer 5 entrevistas con usuarios potenciales antes de escribir una sola línea de código.
