package space.mathub.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15+ draws apps edge to edge; the page pads itself with env(safe-area-inset-*), and older WebViews are
        // padded natively (SystemBars insetsHandling "native" in capacitor.config.json)
        EdgeToEdge.enable(this);
    }
}
