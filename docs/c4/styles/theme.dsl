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
    shape Component
    background "#ef4444"
    color "#ffffff"
}

element "Runtime Entry" {
    shape Component
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

element "Database" {
    shape Cylinder
    background "#475569"
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
