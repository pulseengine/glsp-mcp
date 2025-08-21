# Configuration file for the Sphinx documentation builder.
#
# This file only contains a selection of the most common options. For a full
# list see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Path setup --------------------------------------------------------------

# If extensions (or modules to document with autodoc) are in another directory,
# add these directories to sys.path here. If the directory is relative to the
# documentation root, use os.path.abspath to make it absolute, like shown here.
#
import os
import sys
import platform
import json
import subprocess
import pathlib
import re
sys.path.insert(0, os.path.abspath('../../glsp-mcp-server/src'))

# -- Project information -----------------------------------------------------

project = 'GLSP-Rust'
copyright = '2024, GLSP-Rust Team'
author = 'GLSP-Rust Team'

# Version configuration - Dynamic versioning support
# DOCS_VERSION is set by the build pipeline (e.g., "main", "v0.1.0", "local")
docs_build_env_version = os.environ.get('DOCS_VERSION', 'main')

if docs_build_env_version.lower() in ['main', 'local']:
    release = 'dev'  # Full version string for 'main' or 'local'
    version = 'dev'  # Shorter X.Y version
else:
    # Process semantic versions like "v0.1.0" or "0.1.0"
    parsed_release = docs_build_env_version.lstrip('v')
    release = parsed_release  # Full version string, e.g., "0.1.0"
    version_parts = parsed_release.split('.')
    if len(version_parts) >= 2:
        version = f"{version_parts[0]}.{version_parts[1]}"  # Shorter X.Y, e.g., "0.1"
    else:
        version = parsed_release  # Fallback if not in X.Y.Z or similar format

# current_version is used by the theme for matching in the version switcher
current_version = os.environ.get('DOCS_VERSION', 'main')
# version_path_prefix is used by the theme to construct the URL to switcher.json
version_path_prefix = os.environ.get('DOCS_VERSION_PATH_PREFIX', '/')

# Function to get available versions for version switcher
def get_versions():
    versions = ['main']
    try:
        # Get all tags
        result = subprocess.run(['git', 'tag'], stdout=subprocess.PIPE, universal_newlines=True)
        if result.returncode == 0:
            # Only include semantic version tags (x.y.z)
            tags = result.stdout.strip().split('\n')
            for tag in tags:
                if re.match(r'^\d+\.\d+\.\d+$', tag):
                    versions.append(tag)
    except Exception as e:
        print(f"Error getting versions: {e}")

    return sorted(versions, key=lambda v: v if v == 'main' else [int(x) for x in v.split('.')])

# Available versions for the switcher
versions = get_versions()

# Write versions data for the index page to use for redirection
versions_data = {
    'current_version': current_version,
    'versions': versions,
    'version_path_prefix': version_path_prefix
}

# Ensure _static directory exists
os.makedirs(os.path.join(os.path.dirname(__file__), '_static'), exist_ok=True)

# Write versions data to a JSON file
with open(os.path.join(os.path.dirname(__file__), '_static', 'versions.json'), 'w') as f:
    json.dump(versions_data, f)

# -- General configuration ---------------------------------------------------

# Add any Sphinx extension module names here, as strings. They can be
# extensions coming with Sphinx (named 'sphinx.ext.*') or your custom
# ones.
extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.viewcode',
    'sphinx.ext.napoleon',
    'sphinx.ext.intersphinx',
    'sphinx.ext.todo',
    'sphinx.ext.coverage',
    'sphinx.ext.mathjax',
    'sphinx.ext.ifconfig',
    'sphinx_needs',
    'myst_parser',
    'sphinxcontrib.plantuml',
    'sphinx_design',
    'sphinx_copybutton',
]

# Add any paths that contain templates here, relative to this directory.
templates_path = ['_templates']

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This pattern also affects html_static_path and html_extra_path.
exclude_patterns = []

# -- Options for HTML output -------------------------------------------------

# The theme to use for HTML and HTML Help pages.  See the documentation for
# a list of builtin themes.
#
# Using pydata_sphinx_theme for better version switching and navigation
html_theme = 'pydata_sphinx_theme'

# Add any paths that contain custom static files (such as style sheets) here,
# relative to this directory. They are copied after the builtin static files,
# so a file named "default.css" will overwrite the builtin "default.css".
html_static_path = ['_static']

# Configure table of contents
html_show_sourcelink = False
html_show_sphinx = False

# Configure pydata_sphinx_theme options
html_theme_options = {
    # Configure the version switcher
    "switcher": {
        "json_url": f"{version_path_prefix}switcher.json",
        "version_match": current_version,
    },
    # Put logo on far left, search and utilities on the right
    "navbar_start": ["navbar-logo"],
    # Keep center empty to move main nav to sidebar
    "navbar_center": [],
    # Group version switcher with search and theme switcher on the right
    "navbar_end": ["version-switcher", "search-button", "theme-switcher"],
    # Control navigation bar behavior
    "navbar_align": "left", # Align content to left
    # "use_navbar_nav_drop_shadow": True,  # Unsupported in current theme version
    # Control the sidebar navigation
    "navigation_with_keys": True,
    "show_nav_level": 2, # Show more levels in the left sidebar nav
    "show_toc_level": 2, # On-page TOC levels
    # Collapse navigation to only show current page's children in sidebar
    "collapse_navigation": True,
    "show_prev_next": True,
    # GitHub integration
    "github_url": "https://github.com/glsp-rust/glsp-rust",
    "use_edit_page_button": True,
}

# Sidebar configuration
html_sidebars = {
    "**": ["sidebar-nav-bs.html", "sidebar-ethical-ads.html"]
}

# Add version data to the context for templates
html_context = {
    'current_version': current_version,
    'versions': versions,
    'version_path_prefix': version_path_prefix,
    'display_github': True,
    'github_user': 'glsp-rust',
    'github_repo': 'glsp-rust',
    'github_version': 'main',
    'conf_py_path': '/docs/source/',
}

# -- Options for sphinx_needs -----------------------------------------------

# Define custom need types for GLSP-Rust components
needs_types = [
    {
        'directive': 'req',
        'title': 'Requirement',
        'prefix': 'REQ_',
        'color': '#BFD5E7',
        'style': 'node'
    },
    {
        'directive': 'spec',
        'title': 'Specification',
        'prefix': 'SPEC_',
        'color': '#FEDCD2',
        'style': 'node'
    },
    {
        'directive': 'impl',
        'title': 'Implementation',
        'prefix': 'IMPL_',
        'color': '#DF744A',
        'style': 'node'
    },
    {
        'directive': 'test',
        'title': 'Test Case',
        'prefix': 'TEST_',
        'color': '#DCB239',
        'style': 'node'
    },
    {
        'directive': 'arch',
        'title': 'Architecture',
        'prefix': 'ARCH_',
        'color': '#8BC34A',
        'style': 'node'
    },
    {
        'directive': 'comp',
        'title': 'Component',
        'prefix': 'COMP_',
        'color': '#4CAF50',
        'style': 'node'
    },
    {
        'directive': 'mcp_req',
        'title': 'MCP Requirement',
        'prefix': 'MCP_',
        'color': '#FF9800',
        'style': 'node'
    },
    {
        'directive': 'wasm_req',
        'title': 'WASM Requirement',
        'prefix': 'WASM_',
        'color': '#9C27B0',
        'style': 'node'
    },
    {
        'directive': 'ai_req',
        'title': 'AI Requirement',
        'prefix': 'AI_',
        'color': '#E91E63',
        'style': 'node'
    },
    {
        'directive': 'db_req',
        'title': 'Database Requirement',
        'prefix': 'DB_',
        'color': '#00BCD4',
        'style': 'node'
    },
    {
        'directive': 'sim_req',
        'title': 'Simulation Requirement',
        'prefix': 'SIM_',
        'color': '#795548',
        'style': 'node'
    },
    {
        'directive': 'ui_req',
        'title': 'UI Requirement',
        'prefix': 'UI_',
        'color': '#607D8B',
        'style': 'node'
    },
    {
        'directive': 'safety_req',
        'title': 'Safety Requirement',
        'prefix': 'SAFETY_',
        'color': '#F44336',
        'style': 'node'
    },
    {
        'directive': 'arch_req',
        'title': 'Architecture Requirement',
        'prefix': 'ARCH_',
        'color': '#2196F3',
        'style': 'node'
    },
    {
        'directive': 'arch_principle',
        'title': 'Architecture Principle',
        'prefix': 'PRINCIPLE_',
        'color': '#3F51B5',
        'style': 'node'
    },
    {
        'directive': 'tech_stack',
        'title': 'Technology Stack',
        'prefix': 'TECH_',
        'color': '#FF9800',
        'style': 'node'
    },
    {
        'directive': 'quality_attribute',
        'title': 'Quality Attribute',
        'prefix': 'QA_',
        'color': '#4CAF50',
        'style': 'node'
    },
    # Additional types from WRT configuration
    {
        'directive': 'constraint',
        'title': 'Constraint',
        'prefix': 'CNST_',
        'color': '#4682B4',
        'style': 'node'
    },
    {
        'directive': 'panic',
        'title': 'Panic',
        'prefix': 'PANIC_',
        'color': '#E74C3C',
        'style': 'node'
    },
    {
        'directive': 'src',
        'title': 'Source File',
        'prefix': 'SRC_',
        'color': '#C6C6FF',
        'style': 'node'
    },
    # Architecture-specific types
    {
        'directive': 'arch_component',
        'title': 'Architectural Component',
        'prefix': 'ARCH_COMP_',
        'color': '#FF6B6B',
        'style': 'node'
    },
    {
        'directive': 'arch_interface',
        'title': 'Interface',
        'prefix': 'ARCH_IF_',
        'color': '#4ECDC4',
        'style': 'node'
    },
    {
        'directive': 'arch_decision',
        'title': 'Design Decision',
        'prefix': 'ARCH_DEC_',
        'color': '#45B7D1',
        'style': 'node'
    },
    {
        'directive': 'arch_constraint',
        'title': 'Design Constraint',
        'prefix': 'ARCH_CON_',
        'color': '#96CEB4',
        'style': 'node'
    },
    {
        'directive': 'arch_pattern',
        'title': 'Design Pattern',
        'prefix': 'ARCH_PAT_',
        'color': '#FECA57',
        'style': 'node'
    }
]

# Custom options for needs
needs_extra_options = [
    'rationale',
    'verification',
    'safety_impact',
    'component_type',
    'mcp_operation',
    'wasm_component',
    'ai_capability',
    'database_backend',
    'simulation_type',
    'ui_component',
    'risk_level',
    'priority',
    # Additional options from WRT configuration
    'mitigation',
    'implementation',
    'item_status',
    'handling_strategy',
    'last_updated',
    'file',
    'crate',
    'allocated_requirements',
    'environment',
    'deciders',
    'alternatives',
    'stability',
    'protocol',
    # Architecture directive options
    'description',
    'implications',
    'technologies',
    'category',
    'metric',
    'measurement',
    'target',
]

# Configure need layouts
needs_layouts = {
    'req': {
        'grid': 'simple',
        'layout': {
            'head': ['<<meta("type_name")>>: **<<meta("title")>>** <<meta("id")>>'],
            'meta': ['**Status:** <<meta("status")>>', '**Priority:** <<meta("priority")>>'],
            'footer': ['**Rationale:** <<meta("rationale")>>', '**Verification:** <<meta("verification")>>']
        }
    },
    'safety': {
        'grid': 'simple',
        'layout': {
            'head': ['<<meta("type_name")>>: **<<meta("title")>>** <<meta("id")>>'],
            'meta': ['**Status:** <<meta("status")>>', '**Risk Level:** <<meta("risk_level")>>'],
            'footer': ['**Safety Impact:** <<meta("safety_impact")>>', '**Verification:** <<meta("verification")>>']
        }
    }
}

# Configure need filters
needs_filter_data = {
    'current_version': release,
    'current_date': '2024-01-01'
}

# Configure need warnings - disable for now due to compatibility issue
# needs_warnings = {
#     'req_missing_title': True,
#     'req_missing_content': True,
#     'req_missing_id': True
# }

# Configure need role
needs_role_need_template = '{title} ({id})'
needs_role_need_max_title_length = 30

# Configure need links
needs_flow_configs = {
    'req_flow': {
        'link_types': ['links', 'tests', 'implements'],
        'allowed_filters': ['status', 'priority', 'component_type']
    }
}

# Enable sphinx-needs features
needs_include_needs = True
needs_debug = True
needs_debug_no_external_calls = True
needs_max_title_length = -1
needs_title_optional = True
needs_id_required = False
# needs_id_regex = r'^[A-Z0-9_]{5,}'
# needs_id_length = 7
needs_file_pattern = '**/*.rst'

# Allow all sphinx-needs options for all directives
needs_allow_unsafe_options = True

# Disable warnings for unknown link targets to avoid the many outgoing link warnings
needs_warnings_always_warn = False

# Suppress specific warnings
suppress_warnings = [
    'toc.not_readable',
    'ref.any',
    'docutils',
    'intersphinx.timeout',  # Suppress intersphinx timeout warnings
    'config.cache',  # Suppress cache-related warnings
]

# Configure need statuses
needs_statuses = [
    dict(name="open", description="Open"),
    dict(name="in_progress", description="In Progress"),
    dict(name="implemented", description="Implemented"),
    dict(name="closed", description="Closed"),
    dict(name="pending", description="Pending")
]

# Configure need tags
needs_tags = [
    dict(name="requirement", description="Requirement"),
    dict(name="specification", description="Specification"),
    dict(name="implementation", description="Implementation"),
    dict(name="test", description="Test"),
    dict(name="architecture", description="Architecture"),
    dict(name="safety", description="Safety"),
    dict(name="performance", description="Performance"),
    dict(name="security", description="Security")
]

# Configure need table columns
needs_table_columns = "id,title,status,priority,links"
needs_table_style = "table"

# Configure need services (optional)
needs_services = {
    'github': {
        'url': 'https://github.com/glsp-rust/glsp-rust',
        'need_url': 'https://github.com/glsp-rust/glsp-rust/issues/{{id}}'
    }
}

# Start with simple needs configuration
# needs_extra_links will be added later

# -- Options for PlantUML ---------------------------------------------------

# PlantUML configuration
plantuml = 'java -jar plantuml.jar'
plantuml_output_format = 'svg'
plantuml_latex_output_format = 'pdf'

# Configure PlantUML to work with different systems
import subprocess
import platform

def setup_plantuml():
    """Setup PlantUML based on the operating system."""
    if platform.system() == 'Windows':
        return 'plantuml.bat'
    elif platform.system() == 'Darwin':  # macOS
        try:
            subprocess.run(['which', 'plantuml'], check=True, capture_output=True)
            return 'plantuml'
        except subprocess.CalledProcessError:
            return 'java -jar /usr/local/bin/plantuml.jar'
    else:  # Linux
        try:
            subprocess.run(['which', 'plantuml'], check=True, capture_output=True)
            return 'plantuml'
        except subprocess.CalledProcessError:
            return 'java -jar /usr/bin/plantuml.jar'

plantuml = setup_plantuml()

# Allow customization through environment variables
plantuml_output_format = os.environ.get('PLANTUML_FORMAT', 'svg')

# Regular expression for finding requirement IDs
REQ_RE = re.compile(r"SW-REQ-ID\\s*:\\s*(REQ_\\w+)", re.I)

# Initialize source_suffix before attempting to modify it
source_suffix = {
    '.rst': 'restructuredtext',
    '.md': 'markdown',
}

# Ensure myst_parser is configured for .md files
if isinstance(source_suffix, dict):
    if '.md' not in source_suffix:
        source_suffix['.md'] = 'markdown'
elif isinstance(source_suffix, list):
    if '.md' not in source_suffix:
        source_suffix.append('.md')
else:
    source_suffix = {
        '.rst': 'restructuredtext',
        '.md': 'markdown',
    }

# Dynamic function to extract requirement IDs from a file
def extract_reqs(app, need, needs, *args, **kwargs):
    """Return all REQ_xxx IDs that occur in the file given via :file:."""
    relative_file_path_from_doc_source = need.get("file")
    if not relative_file_path_from_doc_source:
        return ""

    absolute_src_file_path = (pathlib.Path(app.confdir) / relative_file_path_from_doc_source).resolve()

    try:
        text = absolute_src_file_path.read_text(errors="ignore")
        ids  = REQ_RE.findall(text)
        return ";".join(sorted(set(ids)))
    except FileNotFoundError:
        print(f"WARNING: [extract_reqs] File not found: {absolute_src_file_path}")
        return ""
    except Exception as e:
        print(f"ERROR: [extract_reqs] Could not read file {absolute_src_file_path}: {e}")
        return ""

# Configuration to make specific strings in RST linkable
needs_string_links = {
    "req_inline": {
        "regex": r"(?P<value>REQ_\w+)",
        "link_url": "#{{value}}",
        "link_name": "{{value}}",
        "options": [],
    },
}

# Custom setup function with monkeypatch for handling NoneType errors
def setup(app):
    """Custom setup function to handle various sphinx-needs configurations."""

    # Monkeypatch to handle NoneType errors in sphinx-needs
    def safe_str(value):
        if value is None:
            return ""
        return str(value)

    # Register the extract_reqs function as a dynamic function
    # Note: Dynamic functions are handled by sphinx-needs automatically

    # Add custom CSS for better styling
    app.add_css_file('custom.css')

    # Add custom JavaScript for diagram interaction
    app.add_js_file('diagram-zoom.js')

    # Configure additional metadata for builds
    app.add_config_value('build_metadata', {}, 'env')
    app.config.build_metadata = {
        'build_date': '2024-01-01',
        'version': release,
        'environment': os.environ.get('BUILD_ENV', 'development')
    }

    return {
        'version': '0.1',
        'parallel_read_safe': True,
        'parallel_write_safe': True,
    }

# -- Options for MyST Parser -----------------------------------------------

# MyST Parser configuration
myst_enable_extensions = [
    'amsmath',
    'colon_fence',
    'deflist',
    'dollarmath',
    'fieldlist',
    'html_admonition',
    'html_image',
    'replacements',
    'smartquotes',
    'strikethrough',
    'substitution',
    'tasklist',
]

# -- Options for intersphinx ------------------------------------------------

intersphinx_mapping = {
    'python': ('https://docs.python.org/3/', None),
    'rust': ('https://doc.rust-lang.org/stable/', None),
}

# -- Options for todo extension ---------------------------------------------

todo_include_todos = True
todo_emit_warnings = True

# -- Options for coverage extension -----------------------------------------

coverage_show_missing_items = True
coverage_ignore_functions = ['main']

# -- HTML theme options -----------------------------------------------------
# (Theme options are already configured above in the main HTML section)

# -- Additional configuration -----------------------------------------------

# Add custom CSS and JS
html_css_files = [
    'custom.css',
]

html_js_files = [
    'diagram-zoom.js',
]

# Configure code highlighting
pygments_style = 'sphinx'
highlight_language = 'rust'

# Configure section numbering
numfig = True
numfig_format = {
    'figure': 'Figure %s',
    'table': 'Table %s',
    'code-block': 'Listing %s',
    'section': 'Section %s',
}

# Configure cross-references
autosectionlabel_prefix_document = True

# Configure copybutton
copybutton_prompt_text = r'>>> |\.\.\. |\$ |In \[\d*\]: | {2,5}\.\.\.: | {5,8}: '
copybutton_prompt_is_regexp = True
copybutton_only_copy_prompt_lines = True
copybutton_remove_prompts = True

# Configure version switcher
html_context = {
    'display_github': True,
    'github_user': 'glsp-rust',
    'github_repo': 'glsp-rust',
    'github_version': 'main',
    'conf_py_path': '/docs/source/',
}

# Configure custom templates for sphinx-needs
needs_templates = {
    'req_template': '**Requirement**: {{content}}\n\n**Rationale**: {{rationale}}\n\n**Verification**: {{verification}}',
    'safety_template': '**Safety Requirement**: {{content}}\n\n**Safety Impact**: {{safety_impact}}\n\n**Verification**: {{verification}}',
    'qualification_template': '**Qualification**: {{content}}\n\n**Mitigation**: {{mitigation}}\n\n**Implementation**: {{implementation}}',
    'constraint_template': '**Constraint**: {{content}}\n\n**Handling Strategy**: {{handling_strategy}}\n\n**Last Updated**: {{last_updated}}',
    'panic_template': '**Panic**: {{content}}\n\n**Mitigation**: {{mitigation}}\n\n**Status**: {{item_status}}',
}

# Configure custom links for sphinx-needs
needs_extra_links = [
    {
        'option': 'implements',
        'incoming': 'is implemented by',
        'outgoing': 'implements',
        'copy': False,
        'style': 'dashed',
        'color': '#2E8B57',
        'style_part': 'source_line',
        'style_start': 'start_line',
        'style_end': 'end_line',
    },
    {
        'option': 'depends_on',
        'incoming': 'is dependency of',
        'outgoing': 'depends on',
        'copy': False,
        'style': 'dotted',
        'color': '#FF6347',
        'style_part': 'source_line',
        'style_start': 'start_line',
        'style_end': 'end_line',
    },
    {
        'option': 'validates',
        'incoming': 'is validated by',
        'outgoing': 'validates',
        'copy': False,
        'style': 'solid',
        'color': '#4169E1',
        'style_part': 'source_line',
        'style_start': 'start_line',
        'style_end': 'end_line',
    },
    {
        'option': 'mitigates',
        'incoming': 'is mitigated by',
        'outgoing': 'mitigates',
        'copy': False,
        'style': 'dashed',
        'color': '#FF1493',
        'style_part': 'source_line',
        'style_start': 'start_line',
        'style_end': 'end_line',
    },
    {
        'option': 'allocated_to',
        'incoming': 'allocates',
        'outgoing': 'allocated to',
        'copy': False,
        'style': 'solid',
        'color': '#32CD32',
        'style_part': 'source_line',
        'style_start': 'start_line',
        'style_end': 'end_line',
    },
    {
        'option': 'impacts',
        'incoming': 'is impacted by',
        'outgoing': 'impacts',
        'copy': False,
        'style': 'dotted',
        'color': '#FF8C00',
        'style_part': 'source_line',
        'style_start': 'start_line',
        'style_end': 'end_line',
    },
    {
        'option': 'variant_of',
        'incoming': 'has variant',
        'outgoing': 'is variant of',
        'copy': False,
        'style': 'dashed',
        'color': '#9370DB',
        'style_part': 'source_line',
        'style_start': 'start_line',
        'style_end': 'end_line',
    },
    {
        'option': 'provides',
        'incoming': 'is provided by',
        'outgoing': 'provides',
        'copy': False,
        'style': 'solid',
        'color': '#20B2AA',
        'style_part': 'source_line',
        'style_start': 'start_line',
        'style_end': 'end_line',
    },
    {
        'option': 'requires',
        'incoming': 'is required by',
        'outgoing': 'requires',
        'copy': False,
        'style': 'solid',
        'color': '#DC143C',
        'style_part': 'source_line',
        'style_start': 'start_line',
        'style_end': 'end_line',
    },
]
