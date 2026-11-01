import Foundation
import Capacitor
import CoreLocation

/**
 * Reports whether iOS location is authorizedAlways ("Allow all the time").
 */
@objc(AlwaysLocationPlugin)
public class AlwaysLocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "AlwaysLocationPlugin"
    public let jsName = "AlwaysLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
    ]

    private let manager = CLLocationManager()
    private var pendingRequest: CAPPluginCall?

    public override func load() {
        manager.delegate = self
    }

    private func statusPayload() -> [String: Any] {
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }
        let always = status == .authorizedAlways
        let whenInUse = always || status == .authorizedWhenInUse
        return [
            "always": always,
            "whenInUse": whenInUse,
        ]
    }

    @objc func check(_ call: CAPPluginCall) {
        call.resolve(statusPayload())
    }

    @objc func request(_ call: CAPPluginCall) {
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }

        if status == .authorizedAlways {
            call.resolve(statusPayload())
            return
        }

        pendingRequest = call
        DispatchQueue.main.async {
            if status == .notDetermined {
                // Always prompt; iOS may still only grant When In Use first.
                self.manager.requestAlwaysAuthorization()
            } else if status == .authorizedWhenInUse {
                self.manager.requestAlwaysAuthorization()
            } else {
                // Denied / restricted — caller should open Settings.
                let pending = self.pendingRequest
                self.pendingRequest = nil
                pending?.resolve(self.statusPayload())
            }
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let call = pendingRequest else { return }
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }
        if status == .notDetermined {
            return
        }
        pendingRequest = nil
        call.resolve(statusPayload())
    }

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        // iOS 13 and earlier
        locationManagerDidChangeAuthorization(manager)
    }
}
