---
title: Decisión de arquitectura — Base de datos
tags: trabajo, arquitectura, backend
notebook: Trabajo
date: 2026-04-28
---

## Contexto

Necesitamos decidir entre PostgreSQL y MongoDB para el nuevo servicio de analytics.

## Opciones evaluadas

### PostgreSQL

**Pros:**
- Transacciones ACID completas
- Soporte nativo para JSON con `jsonb`
- Ecosistema maduro con Prisma

**Contras:**
- Esquema rígido requiere migraciones
- Escalado horizontal más complejo

### MongoDB

**Pros:**
- Esquema flexible, ideal para datos variables
- Escalado horizontal nativo
- Buena performance en lecturas masivas

**Contras:**
- Sin transacciones multi-documento en versiones antiguas
- Curva de aprendizaje para el equipo actual

## Decisión

Se eligió **PostgreSQL** por:

1. El equipo ya tiene experiencia con SQL
2. Prisma simplifica las migraciones
3. Los datos de analytics tienen estructura predecible

```sql
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_events_type ON events(event_type);
```

---

Revisión en 3 meses para evaluar performance en producción.
