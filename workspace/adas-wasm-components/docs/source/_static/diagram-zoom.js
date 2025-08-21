/* Interactive diagram functionality for ADAS documentation */

document.addEventListener('DOMContentLoaded', function() {
    // Add zoom functionality to PlantUML diagrams
    const diagrams = document.querySelectorAll('.figure img[src*=".svg"]');

    diagrams.forEach(function(img) {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', function() {
            if (img.style.transform === 'scale(1.5)') {
                img.style.transform = 'scale(1)';
                img.style.cursor = 'zoom-in';
            } else {
                img.style.transform = 'scale(1.5)';
                img.style.cursor = 'zoom-out';
                img.style.transition = 'transform 0.3s ease';
            }
        });
    });

    // Add interactive tooltips for ADAS components
    const adasComponents = document.querySelectorAll('.adas-component');
    adasComponents.forEach(function(component) {
        component.addEventListener('mouseenter', function() {
            const title = component.querySelector('h1, h2, h3, h4, h5, h6');
            if (title) {
                component.setAttribute('title', 'ADAS Component: ' + title.textContent);
            }
        });
    });

    // Add ASIL level highlighting
    const asilElements = document.querySelectorAll('[class*="asil-"]');
    asilElements.forEach(function(element) {
        element.addEventListener('mouseenter', function() {
            const level = element.className.match(/asil-([a-d])/);
            if (level) {
                element.setAttribute('title', 'ASIL Level ' + level[1].toUpperCase() + ' - Automotive Safety Integrity Level');
            }
        });
    });

    // Add collapsible behavior to large diagrams
    const largeDiagrams = document.querySelectorAll('.figure');
    largeDiagrams.forEach(function(figure) {
        const img = figure.querySelector('img');
        if (img && img.naturalHeight > 800) {
            const toggleButton = document.createElement('button');
            toggleButton.textContent = 'Toggle Full Size';
            toggleButton.className = 'btn btn-sm btn-outline-primary';
            toggleButton.style.marginTop = '0.5rem';

            let isCollapsed = true;
            img.style.maxHeight = '400px';
            img.style.overflow = 'hidden';

            toggleButton.addEventListener('click', function() {
                if (isCollapsed) {
                    img.style.maxHeight = 'none';
                    toggleButton.textContent = 'Collapse';
                } else {
                    img.style.maxHeight = '400px';
                    toggleButton.textContent = 'Toggle Full Size';
                }
                isCollapsed = !isCollapsed;
            });

            figure.appendChild(toggleButton);
        }
    });
});

// Add keyboard navigation for diagrams
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Reset all zoomed diagrams
        const zoomedImages = document.querySelectorAll('img[style*="scale(1.5)"]');
        zoomedImages.forEach(function(img) {
            img.style.transform = 'scale(1)';
            img.style.cursor = 'zoom-in';
        });
    }
});
