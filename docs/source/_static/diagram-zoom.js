// Diagram zoom functionality for PlantUML diagrams
document.addEventListener('DOMContentLoaded', function() {
    // Add click-to-zoom functionality to PlantUML diagrams
    const plantUMLImages = document.querySelectorAll('.plantuml img');

    plantUMLImages.forEach(function(img) {
        img.addEventListener('click', function() {
            if (img.classList.contains('zoomed')) {
                // Remove zoom
                img.classList.remove('zoomed');
                document.body.style.overflow = 'auto';

                // Remove overlay
                const overlay = document.querySelector('.zoom-overlay');
                if (overlay) {
                    overlay.remove();
                }
            } else {
                // Add zoom
                img.classList.add('zoomed');
                document.body.style.overflow = 'hidden';

                // Add overlay
                const overlay = document.createElement('div');
                overlay.className = 'zoom-overlay';
                overlay.addEventListener('click', function() {
                    img.click(); // Trigger the zoom out
                });
                document.body.appendChild(overlay);
            }
        });
    });

    // Handle escape key to close zoom
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const zoomedImg = document.querySelector('.plantuml img.zoomed');
            if (zoomedImg) {
                zoomedImg.click();
            }
        }
    });

    // Improve diagram container scrolling
    const plantUMLContainers = document.querySelectorAll('.plantuml');
    plantUMLContainers.forEach(function(container) {
        const img = container.querySelector('img');
        if (img) {
            // Add scroll indicators if needed
            img.addEventListener('load', function() {
                if (img.scrollWidth > container.clientWidth) {
                    container.classList.add('scrollable');

                    // Add scroll hint
                    const scrollHint = document.createElement('div');
                    scrollHint.className = 'scroll-hint';
                    scrollHint.textContent = '← Scroll horizontally to see full diagram →';
                    scrollHint.style.cssText = `
                        text-align: center;
                        font-size: 0.8rem;
                        color: #666;
                        margin-top: 0.5rem;
                        font-style: italic;
                    `;
                    container.appendChild(scrollHint);
                }
            });
        }
    });

    // Smooth scrolling for large diagrams
    plantUMLContainers.forEach(function(container) {
        let isScrolling = false;

        container.addEventListener('mousedown', function(e) {
            if (e.target.tagName === 'IMG') {
                isScrolling = true;
                let startX = e.clientX;
                let scrollLeft = container.scrollLeft;

                function handleMouseMove(e) {
                    if (!isScrolling) return;
                    e.preventDefault();
                    const x = e.clientX;
                    const walk = (x - startX) * 2;
                    container.scrollLeft = scrollLeft - walk;
                }

                function handleMouseUp() {
                    isScrolling = false;
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                }

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
        });
    });
});

// Add CSS for scrollable diagrams
const style = document.createElement('style');
style.textContent = `
    .plantuml.scrollable {
        cursor: grab;
        user-select: none;
    }

    .plantuml.scrollable:active {
        cursor: grabbing;
    }

    .scroll-hint {
        animation: fadeIn 0.5s ease-in-out;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    /* Better scrollbar styling */
    .plantuml::-webkit-scrollbar {
        height: 8px;
    }

    .plantuml::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 4px;
    }

    .plantuml::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 4px;
    }

    .plantuml::-webkit-scrollbar-thumb:hover {
        background: #555;
    }
`;
document.head.appendChild(style);
