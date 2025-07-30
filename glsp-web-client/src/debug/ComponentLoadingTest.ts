/**
 * Debug utility to test component loading
 */

export async function testComponentLoading() {
    console.log('🧪 Testing component loading...');
    
    try {
        // Check if we can access the MCP service
        const mcpService = (window as any).debug?.appController?.mcpService;
        if (!mcpService) {
            console.error('❌ MCP Service not available');
            return;
        }

        // Test component scan
        console.log('🔍 Scanning for components...');
        const scanResult = await mcpService.callTool('scan_wasm_components', {});
        console.log('📋 Scan result:', scanResult);

        if (scanResult?.content?.[0]?.text) {
            const scanData = JSON.parse(scanResult.content[0].text);
            console.log('📊 Parsed scan data:', scanData);
            
            const components = scanData.components || [];
            console.log(`📦 Found ${components.length} components`);
            
            components.forEach((comp: any, i: number) => {
                console.log(`  ${i+1}. ${comp.name} - exists: ${comp.fileExists}, status: ${comp.status}`);
            });
            
            return {
                success: true,
                componentCount: components.length,
                components: components.map((c: any) => ({
                    name: c.name,
                    exists: c.fileExists,
                    status: c.status,
                    path: c.path
                }))
            };
        } else {
            console.warn('⚠️ No scan data returned');
            return { success: false, error: 'No scan data' };
        }
        
    } catch (error) {
        console.error('❌ Component loading test failed:', error);
        return { success: false, error: error };
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).testComponentLoading = testComponentLoading;
}