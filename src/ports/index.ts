/**
 * Ports index - re-exports all interfaces
 *
 * Ports define contracts (interfaces) that adapters implement.
 * This is the "hexagonal architecture" / "ports and adapters" pattern.
 */

export * from './storage';
export * from './readers';
export * from './network';
export * from './hooks';
