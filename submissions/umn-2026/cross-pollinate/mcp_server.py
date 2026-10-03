"""Read-only literature MCP server. Run with the project's Python environment."""
import os
from typing import Literal
from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
import literature

mcp = FastMCP("Cross–Pollinate Literature")
EVIDENCE_PATH = os.getenv("CROSS_POLLINATE_EVIDENCE_PATH")


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=True))
def search_literature(query: str, database: Literal["crossref", "europepmc"] = "crossref", limit: int = 4) -> dict:
    """Search scholarly metadata in Crossref or Europe PMC. Read selected source IDs with read_paper."""
    return literature.search_literature(query, database, limit, EVIDENCE_PATH)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=True))
def read_paper(source_id: str) -> dict:
    """Retrieve a real paper's metadata and available abstract using the exact source_id from search_literature."""
    return literature.read_paper(source_id, EVIDENCE_PATH)


if __name__ == "__main__":
    mcp.run(transport="stdio")
