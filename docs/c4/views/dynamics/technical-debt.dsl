dynamic calcul8 "TechnicalDebtFlow" {
    title "Technical debt feedback loop"
    description "Shows how the current debt hotspots turn into verification and refactoring work across local-first state, cloud writes, and realtime recovery."
    admin -> calcul8.web "Reviews frontend coverage, UI consistency, local-first state, Whatnot, and game workflow debt."
    calcul8.web -> calcul8.browserStorage "Concentrates scoped storage, migration, local reset, and offline recovery risk."
    calcul8.web -> calcul8.api "Exposes cross-boundary contract debt in sync, auth, billing, Whatnot, and public game calls."
    calcul8.api -> calcul8.cosmos "Pushes optimistic concurrency, ids, partitions, retries, and audit metadata into repository boundaries."
    calcul8.api -> calcul8.realtime "Publishes best-effort realtime events after authoritative writes."
    calcul8.realtime -> calcul8.web "Forces clients to recover from delivery gaps through refresh, version checks, and reconnect handling."
    autoLayout lr
}
