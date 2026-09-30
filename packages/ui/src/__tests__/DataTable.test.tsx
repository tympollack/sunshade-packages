import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable, type ColumnDef } from '../components/DataTable/DataTable';

interface TestRecord extends Record<string, unknown> {
  id: string;
  name: string;
  role: string;
  score: number;
}

describe('DataTable Primitive Component Suite', () => {
  const columns: ColumnDef<TestRecord>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'role', header: 'Role', sortable: false },
    { key: 'score', header: 'Score', sortable: true, align: 'right' },
  ];

  const sampleData: TestRecord[] = [
    { id: '1', name: 'Alice', role: 'Engineer', score: 95 },
    { id: '2', name: 'Bob', role: 'Designer', score: 82 },
    { id: '3', name: 'Charlie', role: 'Architect', score: 88 },
  ];

  it('renders table headers and column data correctly', () => {
    render(<DataTable columns={columns} data={sampleData} testID="test-table" />);

    expect(screen.getByTestId('test-table-header-name')).toBeDefined();
    expect(screen.getByTestId('test-table-header-role')).toBeDefined();
    expect(screen.getByTestId('test-table-header-score')).toBeDefined();

    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('Charlie')).toBeDefined();
  });

  it('sorts columns when clicking sortable column headers', () => {
    render(<DataTable columns={columns} data={sampleData} virtualized={false} testID="test-table" />);

    const nameHeader = screen.getByTestId('test-table-header-name');

    // First click: asc
    fireEvent.click(nameHeader);
    let rows = screen.getAllByRole('row');
    // rows[0] is header row; rows[1] is first data row
    expect(rows[1].textContent).toContain('Alice');
    expect(rows[3].textContent).toContain('Charlie');

    // Second click: desc
    fireEvent.click(nameHeader);
    rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('Charlie');
    expect(rows[3].textContent).toContain('Alice');
  });

  it('reveals row action buttons and triggers row clicks', () => {
    const handleRowClick = vi.fn();
    const handleActionClick = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={sampleData}
        onRowClick={handleRowClick}
        rowActions={(row) => (
          <button
            data-testid={`action-${row.id}`}
            onClick={(e) => {
              e.stopPropagation();
              handleActionClick(row);
            }}
          >
            Action
          </button>
        )}
        testID="test-table"
      />
    );

    const actionBtn = screen.getByTestId('action-1');
    fireEvent.click(actionBtn);

    expect(handleActionClick).toHaveBeenCalledWith(sampleData[0]);
    expect(handleRowClick).not.toHaveBeenCalled();

    const row0 = screen.getByTestId('test-table-row-0');
    fireEvent.click(row0);
    expect(handleRowClick).toHaveBeenCalledWith(sampleData[0]);
  });

  it('renders graceful empty state when dataset is empty (zero fake data)', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={<div>Custom Empty State</div>}
        testID="test-table"
      />
    );

    expect(screen.getByText('Custom Empty State')).toBeDefined();
  });

  it('virtualizes large datasets (500 rows) by rendering only visible window', () => {
    const largeDataset: TestRecord[] = Array.from({ length: 500 }, (_, i) => ({
      id: `row-${i}`,
      name: `User ${i.toString().padStart(3, '0')}`,
      role: 'Contributor',
      score: i * 2,
    }));

    render(
      <DataTable
        columns={columns}
        data={largeDataset}
        maxHeight={400}
        rowHeight={40}
        virtualized={true}
        testID="test-table"
      />
    );

    // Instead of rendering all 500 DOM rows, only the visible window + overscan rows are rendered
    const renderedRows = screen.queryAllByTestId(/test-table-row-/);
    expect(renderedRows.length).toBeLessThan(50);
    expect(renderedRows.length).toBeGreaterThan(0);
  });
});
