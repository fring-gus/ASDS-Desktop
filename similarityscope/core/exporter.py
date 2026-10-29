"""
SimilarityScope — Excel Exporter
Export results and similarity matrix to an Excel workbook using openpyxl.

Supports two result formats:
  - Semantic: { file_a, file_b, semantic_score, is_flagged, mode }
  - Lexical:  { file_a, file_b, tfidf_score, is_flagged, mode }
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


# ── Styling constants ──
RED_FILL    = PatternFill(start_color="FFB3B3", end_color="FFB3B3", fill_type="solid")
YELLOW_FILL = PatternFill(start_color="FFFFB3", end_color="FFFFB3", fill_type="solid")
HEADER_FILL = PatternFill(start_color="4A4A6A", end_color="4A4A6A", fill_type="solid")
HEADER_FONT = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
BODY_FONT   = Font(name="Segoe UI", size=10)
THIN_BORDER = Border(
    left=Side(style='thin', color='CCCCCC'),
    right=Side(style='thin', color='CCCCCC'),
    top=Side(style='thin', color='CCCCCC'),
    bottom=Side(style='thin', color='CCCCCC'),
)


def _auto_fit_columns(ws):
    """Auto-fit column widths based on content."""
    for col_idx in range(1, ws.max_column + 1):
        max_length = 0
        col_letter = get_column_letter(col_idx)
        for row in ws.iter_rows(min_col=col_idx, max_col=col_idx):
            for cell in row:
                if cell.value is not None:
                    max_length = max(max_length, len(str(cell.value)))
        adjusted_width = min(max_length + 4, 40)
        ws.column_dimensions[col_letter].width = adjusted_width


def export_to_excel(results: list[dict], matrix: list[list[float]],
                    filenames: list[str], filepath: str) -> str | None:
    """
    Export analysis results to an Excel workbook.

    Args:
        results: List of pair comparison result dicts
        matrix: (UNUSED) N×N similarity matrix (kept for backward compatibility with caller)
        filenames: List of filenames corresponding to matrix indices
        filepath: Output .xlsx path

    Returns:
        None on success, error string on failure.
    """
    try:
        wb = Workbook()

        # ── Sheet 1: Flagged Pairs ──
        ws1 = wb.active
        ws1.title = "Flagged Pairs"

        headers = ["Rank", "File A", "File B", "Mode", "Similarity %", "Status"]

        for col_idx, header in enumerate(headers, 1):
            cell = ws1.cell(row=1, column=col_idx, value=header)
            cell.font = HEADER_FONT
            cell.fill = HEADER_FILL
            cell.alignment = Alignment(horizontal='center', vertical='center')
            cell.border = THIN_BORDER

        # Filter only flagged results
        flagged_results = [r for r in results if r.get('is_flagged', False)]

        # Helper to get score based on mode
        def get_score(r):
            return r.get('semantic_score', 0) if r.get('mode', 'semantic') == 'semantic' else r.get('tfidf_score', 0)

        # Sort results by score descending
        sorted_results = sorted(flagged_results, key=get_score, reverse=True)

        for row_idx, result in enumerate(sorted_results, 2):
            mode = result.get('mode', 'semantic')
            score = get_score(result)

            row_data = [
                row_idx - 1,                           # Rank
                result.get('file_a', ''),              # File A
                result.get('file_b', ''),              # File B
                mode.capitalize(),                     # Mode
                f"{score * 100:.1f}%",                 # Score %
                "FLAGGED",                             # Status
            ]

            for col_idx, value in enumerate(row_data, 1):
                cell = ws1.cell(row=row_idx, column=col_idx, value=value)
                cell.font = BODY_FONT
                cell.alignment = Alignment(horizontal='center', vertical='center')
                cell.border = THIN_BORDER

            # Color code rows
            if score >= 0.65:
                for col_idx in range(1, len(headers) + 1):
                    ws1.cell(row=row_idx, column=col_idx).fill = RED_FILL
            elif score >= 0.50:
                for col_idx in range(1, len(headers) + 1):
                    ws1.cell(row=row_idx, column=col_idx).fill = YELLOW_FILL

        _auto_fit_columns(ws1)

        wb.save(filepath)
        return None

    except Exception as e:
        return f"Error exporting to Excel: {str(e)}"

