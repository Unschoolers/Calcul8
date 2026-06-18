element "Person" {
    shape Person
    background "#0f766e"
    color "#ffffff"
}

element "Web App" {
    shape WebBrowser
    background "#2563eb"
    color "#ffffff"
}

element "Public Surface" {
    background "#0891b2"
    color "#ffffff"
}

element "API" {
    shape Hexagon
    background "#7c3aed"
    color "#ffffff"
}

element "Realtime" {
    shape Pipe
    background "#dc2626"
    color "#ffffff"
}

element "Realtime Component" {
    shape RoundedBox
    background "#ef4444"
    color "#ffffff"
}

element "Web Component" {
    shape RoundedBox
    background "#1d4ed8"
    color "#ffffff"
}

element "API Component" {
    shape RoundedBox
    background "#6d28d9"
    color "#ffffff"
}

element "Runtime Entry" {
    shape RoundedBox
    background "#0369a1"
    color "#ffffff"
}

element "Boundary" {
    stroke "#111827"
    strokeWidth 4
}

element "Security Boundary" {
    background "#b91c1c"
    color "#ffffff"
    stroke "#111827"
    strokeWidth 4
}

element "Validation Boundary" {
    background "#c2410c"
    color "#ffffff"
}

element "In Memory State" {
    shape Cylinder
    background "#7f1d1d"
    color "#ffffff"
}

element "Shared Contract" {
    background "#be123c"
    color "#ffffff"
}

element "External Client" {
    background "#0f766e"
    color "#ffffff"
}

element "Database Boundary" {
    shape Cylinder
    background "#334155"
    color "#ffffff"
}

element "Database" {
    shape Cylinder
    background "#475569"
    color "#ffffff"
}

element "Local State" {
    shape Cylinder
    background "#1e40af"
    color "#ffffff"
}

element "Local Storage" {
    shape Cylinder
    background "#64748b"
    color "#ffffff"
}

element "Tooling" {
    shape RoundedBox
    background "#334155"
    color "#ffffff"
}

relationship "Relationship" {
    color "#64748b"
    thickness 2
}

element "Perspective:Technical Debt" {
    stroke "#334155"
    strokeWidth 4
}

element "Perspective:Technical Debt[value==Critical]" {
    stroke "#991b1b"
    strokeWidth 8
}

element "Perspective:Technical Debt[value==High]" {
    stroke "#dc2626"
    strokeWidth 6
}

element "Perspective:Technical Debt[value==Medium]" {
    stroke "#f59e0b"
    strokeWidth 5
}

element "Perspective:Technical Debt[value==Low]" {
    stroke "#16a34a"
    strokeWidth 4
}

relationship "Perspective:Technical Debt" {
    color "#334155"
    thickness 3
}

relationship "Perspective:Technical Debt[value==Critical]" {
    color "#991b1b"
    thickness 6
}

relationship "Perspective:Technical Debt[value==High]" {
    color "#dc2626"
    thickness 5
}

relationship "Perspective:Technical Debt[value==Medium]" {
    color "#f59e0b"
    thickness 4
}
