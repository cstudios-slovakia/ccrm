import React from "react";
import { cx } from "../../lib/tremorUtils";

const TableRoot = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { pageWrap?: boolean }
>(({ className, children, pageWrap = false, ...props }, forwardedRef) => (
  <div
    ref={forwardedRef}
    tremor-id="tremor-raw"
    className={cx(pageWrap ? "table-page-wrap" : "w-full overflow-x-auto", className)}
    {...props}
  >
    <div className="inline-block min-w-full align-middle">{children}</div>
  </div>
));
TableRoot.displayName = "TableRoot";

const Table = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, forwardedRef) => (
  <table
    ref={forwardedRef}
    className={cx("w-full caption-bottom border-b border-gray-200", className)}
    {...props}
  />
));
Table.displayName = "Table";

const TableHead = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }
>(({ className, sticky = false, ...props }, forwardedRef) => (
  <thead
    ref={forwardedRef}
    className={cx(
      "bg-gray-50/90",
      sticky && "table-page-sticky-head",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableHeaderCell = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, forwardedRef) => (
  <th
    ref={forwardedRef}
    className={cx(
      "border-b border-gray-200 px-4 py-3 text-left table-header text-gray-700",
      className
    )}
    {...props}
  />
));
TableHeaderCell.displayName = "TableHeaderCell";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, forwardedRef) => (
  <tbody
    ref={forwardedRef}
    className={cx("divide-y divide-gray-200 bg-white", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }
>(({ className, selected, ...props }, forwardedRef) => (
  <tr
    ref={forwardedRef}
    data-selected={selected ? "true" : undefined}
    className={cx(
      "transition-colors hover:bg-entity-subtle/40",
      selected && "bg-entity-subtle/70",
      "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4",
      "[&_td:last-child]:pr-4 [&_th:last-child]:pr-4",
      className
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, forwardedRef) => (
  <td
    ref={forwardedRef}
    className={cx("px-4 py-3 text-ui text-gray-700 whitespace-nowrap", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableFoot = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, forwardedRef) => (
  <tfoot
    ref={forwardedRef}
    className={cx(
      "border-t border-gray-200 bg-gray-50/80 text-left font-medium text-gray-900",
      className
    )}
    {...props}
  />
));
TableFoot.displayName = "TableFoot";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, forwardedRef) => (
  <caption
    ref={forwardedRef}
    className={cx("mt-3 px-3 text-center text-caption text-gray-500", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
};
