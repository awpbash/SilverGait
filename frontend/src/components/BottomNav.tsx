/**
 * Bottom Navigation
 * Government-trust design - simple, clear labels
 */

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface BottomNavProps {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function BottomNav({ items, activeId, onSelect }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={`nav-item ${activeId === item.id ? 'active' : ''}`}
          aria-current={activeId === item.id ? 'page' : undefined}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
