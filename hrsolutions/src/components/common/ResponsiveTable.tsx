import React from 'react';

type ElementProps = { children?: React.ReactNode; colSpan?: number; className?: string; [key: string]: unknown };
type Element = React.ReactElement<ElementProps>;

function textOf(node: React.ReactNode): string {
  return React.Children.toArray(node).map((child) => typeof child === 'string' || typeof child === 'number' ? String(child) : React.isValidElement<ElementProps>(child) ? textOf(child.props.children) : '').join(' ').trim();
}

function mapNodes(nodes: React.ReactNode, map: (element: Element) => React.ReactNode): React.ReactNode {
  return React.Children.map(nodes, (node) => {
    if (!React.isValidElement<ElementProps>(node)) return node;
    if (node.type === React.Fragment) return React.cloneElement(node, {}, mapNodes(node.props.children, map));
    return map(node);
  });
}

/** One semantic table and one set of controls; rows become labelled cards on phones. */
export function ResponsiveTable({ children, className = '', ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const labels: string[] = [];
  mapNodes(children, (section) => {
    if (section.type === 'thead') mapNodes(section.props.children, (row) => {
      mapNodes(row.props.children, (cell) => { labels.push(textOf(cell.props.children)); return cell; });
      return row;
    });
    return section;
  });
  const sections = mapNodes(children, (section) => {
    if (section.type !== 'tbody') return section;
    return React.cloneElement(section, { role: 'rowgroup' }, mapNodes(section.props.children, (row) => {
      if (row.type !== 'tr') return row;
      let column = 0;
      return React.cloneElement(row, { role: 'row' }, mapNodes(row.props.children, (cell) => {
        if (cell.type !== 'td' && cell.type !== 'th') return cell;
        const index = column;
        column += Number(cell.props.colSpan || 1);
        const wide = Number(cell.props.colSpan || 1) > 1;
        return React.cloneElement(cell, { role: 'cell', 'data-label': wide ? undefined : labels[index], 'data-mobile-title': index === 0 && !wide ? 'true' : undefined, 'data-mobile-wide': wide ? 'true' : undefined });
      }));
    }));
  });
  return <table {...props} role="table" className={`mobile-record-table ${className}`}>{sections}</table>;
}
