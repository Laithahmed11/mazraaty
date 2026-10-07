import SwiftUI
import MapKit

@MainActor
struct FarmDetailView: View {
    let farm: Farm
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL
    @State private var showsBooking = false

    private var coordinate: CLLocationCoordinate2D? {
        guard let latitude = farm.latitude, let longitude = farm.longitude,
              (-90...90).contains(latitude), (-180...180).contains(longitude) else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                gallery
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(farm.name).font(.largeTitle.bold()).foregroundStyle(Theme.deep)
                        Label(farm.locationLabel.isEmpty ? "الموقع ينتظر التحديث" : farm.locationLabel, systemImage: "mappin.and.ellipse")
                            .font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    HStack(spacing: 12) {
                        metric("السعر المنشور", value: farm.priceIQD > 0 ? farm.priceIQD.iqd : "غير محدد", symbol: "banknote")
                        metric("السعة", value: farm.capacity > 0 ? "\(farm.capacity) شخص" : "غير محددة", symbol: "person.2")
                    }
                    if !farm.description.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("عن المزرعة").font(.title3.bold())
                            Text(farm.description).font(.body).foregroundStyle(Theme.muted).lineSpacing(5)
                        }
                    }
                    if !farm.amenities.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("شنو متوفر؟").font(.title3.bold())
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), alignment: .leading)], alignment: .leading, spacing: 12) {
                                ForEach(Array(farm.amenities.enumerated()), id: \.offset) { _, amenity in
                                    Label(amenity, systemImage: "checkmark.circle.fill")
                                        .font(.subheadline).foregroundStyle(Theme.forest)
                                        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                                        .background(.white, in: RoundedRectangle(cornerRadius: 12))
                                }
                            }
                        }
                    }
                    if let coordinate {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("الموقع").font(.title3.bold())
                            Map(initialPosition: .region(MKCoordinateRegion(center: coordinate,
                                span: MKCoordinateSpan(latitudeDelta: 0.03, longitudeDelta: 0.03)))) {
                                Marker(farm.name, coordinate: coordinate).tint(Theme.forest)
                            }
                            .frame(height: 190)
                            .clipShape(RoundedRectangle(cornerRadius: 18))
                            .allowsHitTesting(false)
                            .accessibilityLabel("موقع \(farm.name) على الخريطة")
                            Button { openDirections(coordinate) } label: {
                                Label("افتح الاتجاهات في الخرائط", systemImage: "arrow.triangle.turn.up.right.diamond")
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    NoticeView(message: "الطلب داخل مزرعتي ينتظر مراجعة الإدارة، ولا يحجز موعد Wix وحده. الحجز الرسمي والدفع يتمان عبر صفحة المزرعة في Wix.")
                    if !farm.canRequestBooking {
                        NoticeView(message: "طلب الحجز يتوفر بعد تحديد السعر والسعة من الإدارة.")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
        .background(Theme.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { store.toggleFavorite(farm.id) } label: {
                    Image(systemName: store.favorites.contains(farm.id) ? "heart.fill" : "heart")
                }
                .accessibilityLabel(store.favorites.contains(farm.id) ? "إزالة من المفضلة" : "إضافة إلى المفضلة")
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 0) {
                Divider()
                if let url = farm.officialBookingURL {
                    Button { openURL(url) } label: { Label("إكمال الحجز في Wix", systemImage: "arrow.up.right.square") }
                        .buttonStyle(PrimaryButtonStyle())
                        .padding(.horizontal, 20).padding(.top, 12)
                }
                Button { showsBooking = true } label: { Label("اطلب حجز هالمزرعة", systemImage: "calendar.badge.plus") }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                    .disabled(!store.catalogConfigured || !farm.canRequestBooking)
                    .opacity(store.catalogConfigured && farm.canRequestBooking ? 1 : 0.5)
                    .padding(.horizontal, 20).padding(.vertical, 12)
            }
            .background(.regularMaterial)
        }
        .sheet(isPresented: $showsBooking) { BookingFormView(farm: farm) }
    }

    private var gallery: some View {
        TabView {
            if farm.images.isEmpty {
                FarmImage(urlString: nil)
            } else {
                ForEach(Array(farm.images.enumerated()), id: \.offset) { _, url in
                    FarmImage(urlString: url).clipped()
                }
            }
        }
        .tabViewStyle(.page(indexDisplayMode: farm.images.count > 1 ? .automatic : .never))
        .frame(height: 300)
        .accessibilityLabel("صور \(farm.name)، \(farm.images.count) صور")
    }

    private func metric(_ title: String, value: String, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Label(title, systemImage: symbol).font(.caption).foregroundStyle(Theme.muted)
            Text(value).font(.headline).foregroundStyle(Theme.forest)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.mint.opacity(0.65), in: RoundedRectangle(cornerRadius: 16))
    }

    private func openDirections(_ coordinate: CLLocationCoordinate2D) {
        var components = URLComponents(string: "https://maps.apple.com/")!
        components.queryItems = [
            URLQueryItem(name: "daddr", value: "\(coordinate.latitude),\(coordinate.longitude)"),
            URLQueryItem(name: "q", value: farm.name),
            URLQueryItem(name: "dirflg", value: "d")
        ]
        if let url = components.url { openURL(url) }
    }
}
