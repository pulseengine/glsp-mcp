# Configuration file for the ADAS WASM Components documentation
# This extends the core GLSP-Rust documentation with workspace-specific requirements

import os
import sys
import platform
import json
import subprocess
import pathlib
import re

# -- Project information -----------------------------------------------------
project = 'ADAS WASM Components'
copyright = '2024, GLSP-Rust Team'
author = 'GLSP-Rust Team'

# Version configuration - Dynamic versioning support
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

# -- General configuration ---------------------------------------------------
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
exclude_patterns = []

# -- Sphinx-needs configuration ----------------------------------------------
# ADAS-specific needs types extending the core GLSP-Rust types
needs_types = [
    # Core requirements (inherited from main docs)
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
        'directive': 'safety_req',
        'title': 'Safety Requirement',
        'prefix': 'SAFETY_',
        'color': '#F44336',
        'style': 'node'
    },
    # ADAS-specific requirements
    {
        'directive': 'adas_req',
        'title': 'ADAS Requirement',
        'prefix': 'ADAS_REQ_',
        'color': '#FF5722',
        'style': 'node'
    },
    {
        'directive': 'adas_comp',
        'title': 'ADAS Component',
        'prefix': 'ADAS_COMP_',
        'color': '#FF9800',
        'style': 'node'
    },
    {
        'directive': 'adas_safety',
        'title': 'ADAS Safety Requirement',
        'prefix': 'ADAS_SAFETY_',
        'color': '#F44336',
        'style': 'node'
    },
    {
        'directive': 'sensor_req',
        'title': 'Sensor Requirement',
        'prefix': 'SENSOR_',
        'color': '#03A9F4',
        'style': 'node'
    },
    {
        'directive': 'ai_comp',
        'title': 'AI Component',
        'prefix': 'AI_COMP_',
        'color': '#9C27B0',
        'style': 'node'
    },
    {
        'directive': 'fusion_comp',
        'title': 'Fusion Component',
        'prefix': 'FUSION_',
        'color': '#4CAF50',
        'style': 'node'
    },
    {
        'directive': 'control_comp',
        'title': 'Control Component',
        'prefix': 'CONTROL_',
        'color': '#2196F3',
        'style': 'node'
    },
    {
        'directive': 'system_comp',
        'title': 'System Component',
        'prefix': 'SYSTEM_',
        'color': '#9E9E9E',
        'style': 'node'
    },
    {
        'directive': 'asil_req',
        'title': 'ASIL Requirement',
        'prefix': 'ASIL_',
        'color': '#E91E63',
        'style': 'node'
    }
]

needs_extra_options = [
    # Core options (inherited from main docs)
    'rationale',
    'verification',
    'priority',
    'safety_impact',
    'risk_level',
    'mitigation',
    'implementation',
    'item_status',
    'handling_strategy',
    'last_updated',
    # ADAS-specific options
    'asil_level',          # Automotive Safety Integrity Level (A, B, C, D)
    'sensor_type',         # Type of sensor (camera, lidar, radar, ultrasonic)
    'ai_model',           # AI model used (YOLOv5n, etc.)
    'latency_requirement', # Performance latency requirement (ms)
    'component_category',  # Category of component (sensor, fusion, control, system)
    'iso_reference',      # ISO 26262 reference section
    'wit_interface',      # WIT interface file reference
    'bazel_target',       # Bazel build target
    'frequency',          # Operating frequency (Hz)
    'accuracy_requirement', # Accuracy requirement (%)
    'fault_tolerance',    # Fault tolerance level
    'redundancy_level',   # Redundancy level (single, dual, triple)
    'operating_conditions', # Environmental operating conditions
    'power_consumption',  # Power consumption requirements
    'certification_level', # Certification level required
]

# Configure need layouts - minimal configuration to avoid conflicts
needs_layouts = {}

# Configure need statuses
needs_statuses = [
    dict(name="open", description="Open"),
    dict(name="in_progress", description="In Progress"),
    dict(name="implemented", description="Implemented"),
    dict(name="closed", description="Closed"),
    dict(name="pending", description="Pending"),
    dict(name="under_review", description="Under Review"),
    dict(name="verified", description="Verified"),
    dict(name="validated", description="Validated")
]

# Configure need tags for ADAS
needs_tags = [
    dict(name="requirement", description="Requirement"),
    dict(name="specification", description="Specification"),
    dict(name="implementation", description="Implementation"),
    dict(name="test", description="Test"),
    dict(name="safety", description="Safety"),
    dict(name="performance", description="Performance"),
    dict(name="security", description="Security"),
    dict(name="adas", description="ADAS"),
    dict(name="sensor", description="Sensor"),
    dict(name="ai", description="AI/ML"),
    dict(name="fusion", description="Fusion"),
    dict(name="control", description="Control"),
    dict(name="iso26262", description="ISO 26262"),
    dict(name="asil", description="ASIL"),
    dict(name="wasm", description="WebAssembly")
]

# Enable sphinx-needs features
needs_include_needs = True
needs_debug = False
needs_debug_no_external_calls = True
needs_max_title_length = -1
needs_title_optional = True
needs_id_required = False
needs_file_pattern = '**/*.rst'
needs_allow_unsafe_options = True
needs_warnings_always_warn = False

# Filter configuration
needs_filter_data = {
    'current_version': release,
    'current_date': '2024-01-01'
}

# Configure need role
needs_role_need_template = '{title} ({id})'
needs_role_need_max_title_length = 30

# Configure custom links for ADAS components
needs_extra_links = [
    {
        'option': 'implements',
        'incoming': 'is implemented by',
        'outgoing': 'implements',
        'copy': False,
        'style': 'dashed',
        'color': '#2E8B57',
    },
    {
        'option': 'depends_on',
        'incoming': 'is dependency of',
        'outgoing': 'depends on',
        'copy': False,
        'style': 'dotted',
        'color': '#FF6347',
    },
    {
        'option': 'validates',
        'incoming': 'is validated by',
        'outgoing': 'validates',
        'copy': False,
        'style': 'solid',
        'color': '#4169E1',
    },
    {
        'option': 'mitigates',
        'incoming': 'is mitigated by',
        'outgoing': 'mitigates',
        'copy': False,
        'style': 'dashed',
        'color': '#FF1493',
    },
    {
        'option': 'sensor_feeds',
        'incoming': 'receives data from',
        'outgoing': 'feeds data to',
        'copy': False,
        'style': 'solid',
        'color': '#1E90FF',
    },
    {
        'option': 'controls',
        'incoming': 'is controlled by',
        'outgoing': 'controls',
        'copy': False,
        'style': 'solid',
        'color': '#32CD32',
    }
]

# Link to main documentation
intersphinx_mapping = {
    'python': ('https://docs.python.org/3/', None),
    # 'rust': ('https://doc.rust-lang.org/stable/', None),  # Disabled due to 404 issues
    'glsp-rust': ('../../../../docs/build/html', None),
}

# -- Options for HTML output -------------------------------------------------
# Using pydata_sphinx_theme for consistency with main docs
html_theme = 'pydata_sphinx_theme'
html_static_path = ['_static']
html_title = 'ADAS WASM Components Documentation'

# Configure table of contents
html_show_sourcelink = False
html_show_sphinx = False

# Configure pydata_sphinx_theme options
html_theme_options = {
    # Put logo on far left, search and utilities on the right
    "navbar_start": ["navbar-logo"],
    # Keep center empty to move main nav to sidebar
    "navbar_center": [],
    # Group utilities on the right
    "navbar_end": ["search-button", "theme-switcher"],
    # Control navigation bar behavior
    "navbar_align": "left", # Align content to left
    # Control the sidebar navigation
    "navigation_with_keys": True,
    "show_nav_level": 2, # Show more levels in the left sidebar nav
    "show_toc_level": 2, # On-page TOC levels
    # Collapse navigation to only show current page's children in sidebar
    "collapse_navigation": True,
    "show_prev_next": True,
    # GitHub integration - point to workspace
    "github_url": "https://github.com/glsp-rust/glsp-rust",
    "use_edit_page_button": True,
}

# Sidebar configuration
html_sidebars = {
    "**": ["sidebar-nav-bs.html", "sidebar-ethical-ads.html"]
}

# Add context for templates
html_context = {
    'display_github': True,
    'github_user': 'glsp-rust',
    'github_repo': 'glsp-rust',
    'github_version': 'main',
    'conf_py_path': '/workspace/adas-wasm-components/docs/source/',
}

# -- Options for PlantUML ---------------------------------------------------

# PlantUML configuration
plantuml = 'java -jar plantuml.jar'
plantuml_output_format = 'svg'
plantuml_latex_output_format = 'pdf'

# Configure PlantUML to work with different systems
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

# -- MyST Parser configuration ----------------------------------------------

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

# Initialize source_suffix
source_suffix = {
    '.rst': 'restructuredtext',
    '.md': 'markdown',
}

# -- Options for todo extension ---------------------------------------------

todo_include_todos = True
todo_emit_warnings = True

# -- Options for coverage extension -----------------------------------------

coverage_show_missing_items = True
coverage_ignore_functions = ['main']

# -- Additional configuration -----------------------------------------------

# Suppress specific warnings
suppress_warnings = [
    'toc.not_readable',
    'ref.any',
    'docutils',
    'intersphinx.timeout',  # Suppress intersphinx timeout warnings
    'config.cache',  # Suppress cache-related warnings
    'needs.link_outgoing',  # Suppress unknown link warnings for demo purposes
]

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
copybutton_prompt_text = r'>>> |\\.\\.\\. |\\$ |In \\[\\d*\\]: | {2,5}\\.\\.\\.: | {5,8}: '
copybutton_prompt_is_regexp = True
copybutton_only_copy_prompt_lines = True
copybutton_remove_prompts = True

# Custom setup function
def setup(app):
    """Custom setup function for ADAS workspace documentation."""

    # Add custom CSS for ADAS-specific styling
    app.add_css_file('custom.css')

    # Add custom JavaScript for ADAS diagrams
    app.add_js_file('diagram-zoom.js')

    # Configure additional metadata for ADAS builds
    app.add_config_value('build_metadata', {}, 'env')
    app.config.build_metadata = {
        'build_date': '2024-01-01',
        'version': release,
        'environment': os.environ.get('BUILD_ENV', 'development'),
        'workspace': 'adas-wasm-components'
    }

    return {
        'version': '0.1',
        'parallel_read_safe': True,
        'parallel_write_safe': True,
    }
