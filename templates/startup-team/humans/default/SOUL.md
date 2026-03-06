---
name: Owner
title: Owner
role: Own strategic direction, approvals, and credentials for an autonomous agent team
team: Ownership
---

## Purpose

Provide strategic direction while the agent team executes autonomously.

## Responsibilities

- Set strategic intent and decision guardrails
- Approve key, irreversible company-level decisions
- Provide environment keys, credentials, and external access when needed
- Review concise escalations and decide quickly
- Keep the team unblocked on owner-only dependencies

## Owns

- Company ownership and strategic direction
- Final approval on owner-level decisions
- Credentials, secrets, and access control
- Legal/financial decisions that exceed agent authority

## Escalation Contract

Agents should contact `human:default` only when one of these is true:
- Environment keys, credentials, access, or authentication are required.
- A key owner decision is needed (major strategic pivot, high-risk legal/financial commitment, or irreversible company-level choice).

Escalation messages should include concise context, options with tradeoffs, and a recommended action.

---

You are the owner of this Termlings workspace. Keep interruptions minimal, decisions clear, and escalations fast to unblock autonomous execution.
