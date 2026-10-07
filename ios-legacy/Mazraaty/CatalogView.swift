import SwiftUI

@MainActor
struct RootView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            NavigationStack { CatalogView() }
                .tabItem { Label("اكتشف", systemImage: "leaf") }
            NavigationStack { FavoritesView() }
                .tabItem { Label("المفضلة", systemImage: "heart") }
            NavigationStack { BookingsView() }
                .tabItem { Label("حجوزاتي", systemImage: "calendar") }
            NavigationStack { SettingsView() }
                .tabItem { Label("المزيد", systemImage: "ellipsis.circle") }
        }
        .task { await store.refreshCatalog() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.refreshCatalog() } }
        }
    }
}

@MainActor
struct CatalogView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var heroHeight = 285.0
    @State private var search = ""
    @State private var governorate = "الكل"

    private var governorates: [String] {
        ["الكل"] + Set(store.farms.map(\.governorate).filter { !$0.isEmpty }).sorted()
    }

    private var filteredFarms: [Farm] {
        store.farms.filter { farm in
            (governorate == "الكل" || farm.governorate == governorate) &&
            (search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
             "\(farm.name) \(farm.locationLabel) \(farm.description)".localizedStandardContains(search))
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                hero
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text("اختار مكان جمعتكم").font(.title2.bold()).foregroundStyle(Theme.deep)
                        Spacer()
                        if store.isLoadingCatalog { ProgressView() }
                    }
                    Text("مزارع سياحية في العراق، وطلب حجز واضح من البداية.")
                        .font(.subheadline).foregroundStyle(Theme.muted)
                    filters

                    if let error = store.catalogError {
                        NoticeView(message: error, isError: true)
                        Button("إعادة المحاولة") { Task { await store.refreshCatalog() } }
                            .buttonStyle(.bordered)
                    }
                    if !store.catalogConfigured, !store.isLoadingCatalog, store.catalogError == nil {
                        NoticeView(message: store.catalogMessage ?? "سيظهر دليل المزارع بعد ربط بيانات Wix من لوحة الإدارة.")
                    }

                    if filteredFarms.isEmpty && !store.isLoadingCatalog {
                        EmptyState(symbol: "leaf", title: store.farms.isEmpty ? "دليل المزارع ينتظر البيانات" : "ماكو نتائج لهالبحث",
                                   message: store.farms.isEmpty ? "حدّث الصفحة بعد إضافة المزارع وربط الخدمة." : "جرّب اسم مزرعة أو محافظة ثانية.")
                    } else {
                        LazyVStack(spacing: 20) {
                            ForEach(filteredFarms) { farm in
                                FarmCard(farm: farm)
                                    .scrollTransition { content, phase in
                                        content.opacity(reduceMotion || phase.isIdentity ? 1 : 0.75)
                                            .scaleEffect(reduceMotion || phase.isIdentity ? 1 : 0.97)
                                    }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
        }
        .coordinateSpace(name: "catalog")
        .background(Theme.canvas)
        .navigationTitle("مزرعتي")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "ابحث عن مزرعة أو منطقة")
        .refreshable { await store.refreshCatalog() }
        .onChange(of: store.farms) { _, _ in
            if !governorates.contains(governorate) { governorate = "الكل" }
        }
    }

    private var hero: some View {
        GeometryReader { proxy in
            let scroll = proxy.frame(in: .named("catalog")).minY
            ZStack(alignment: .trailing) {
                // Original Wix landing image is a decorative brand image, not a farm listing.
                FarmImage(urlString: "https://static.wixstatic.com/media/4548bd_46fb59b97ee04f3989f846491638d86e~mv2.jpg", placeholderTitle: "مزرعتي")
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .offset(y: reduceMotion ? 0 : scroll * 0.14)
                LinearGradient(colors: [Theme.deep.opacity(0.08), Theme.deep.opacity(0.8)], startPoint: .leading, endPoint: .trailing)
                VStack(alignment: .leading, spacing: 14) {
                    Label("طلعتكم تبدأ هنا", systemImage: "sun.max.fill")
                        .font(.subheadline.bold()).foregroundStyle(Theme.gold)
                    Text("يوم أحلى\nبين خضرة العراق")
                        .font(.system(.largeTitle, design: .rounded).bold())
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("شوف التفاصيل، اختار يومكم،\nوارسل طلب الحجز.")
                        .font(.subheadline).foregroundStyle(Theme.mint)
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .overlay(alignment: .bottomTrailing) {
                Text("صورة من الموقع الأصلي").font(.caption2)
                    .foregroundStyle(.white).padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Theme.deep.opacity(0.65), in: Capsule()).padding(10)
            }
            .clipShape(RoundedRectangle(cornerRadius: 24))
        }
        .frame(height: heroHeight)
        .padding(.horizontal, 16)
        .padding(.top, 10)
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(governorates, id: \.self) { item in
                    Button { governorate = item } label: {
                        Text(item).font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 18).padding(.vertical, 12)
                            .background(governorate == item ? Theme.forest : Color.white, in: Capsule())
                            .foregroundStyle(governorate == item ? Color.white : Theme.forest)
                    }
                    .accessibilityAddTraits(governorate == item ? .isSelected : [])
                }
            }
        }
        .accessibilityLabel("تصفية حسب المحافظة")
    }
}

@MainActor
struct FarmCard: View {
    let farm: Farm
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ZStack(alignment: .topLeading) {
            NavigationLink {
                FarmDetailView(farm: farm)
            } label: {
                VStack(alignment: .leading, spacing: 0) {
                    FarmImage(urlString: farm.images.first)
                        .frame(height: 210)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        .overlay(alignment: .bottomTrailing) {
                            if !farm.governorate.isEmpty {
                                Label(farm.governorate, systemImage: "mappin")
                                    .font(.caption.bold()).padding(.horizontal, 12).padding(.vertical, 8)
                                    .background(.regularMaterial, in: Capsule()).padding(12)
                            }
                        }
                    VStack(alignment: .leading, spacing: 10) {
                        Text(farm.name).font(.title3.bold()).foregroundStyle(Theme.deep)
                        Text(farm.locationLabel).font(.subheadline).foregroundStyle(Theme.muted)
                        HStack(alignment: .firstTextBaseline) {
                            if farm.priceIQD > 0 {
                                Text(farm.priceIQD.iqd).font(.headline).foregroundStyle(Theme.forest)
                                Text("السعر المنشور").font(.caption).foregroundStyle(Theme.muted)
                            } else { Text("السعر ينتظر التحديث").font(.subheadline).foregroundStyle(Theme.muted) }
                            Spacer()
                            if farm.capacity > 0 {
                                Label("\(farm.capacity)", systemImage: "person.2").font(.caption).foregroundStyle(Theme.muted)
                                    .accessibilityLabel("السعة \(farm.capacity) شخص")
                            }
                        }
                    }.padding(18)
                }
                .background(.white)
                .clipShape(RoundedRectangle(cornerRadius: 22))
                .overlay { RoundedRectangle(cornerRadius: 22).stroke(Theme.forest.opacity(0.08), lineWidth: 1) }
            }
            .buttonStyle(.plain)
            Button { store.toggleFavorite(farm.id) } label: {
                Image(systemName: store.favorites.contains(farm.id) ? "heart.fill" : "heart")
                    .font(.title3).foregroundStyle(Theme.forest)
                    .frame(width: 46, height: 46).background(.regularMaterial, in: Circle())
            }
            .padding(12)
            .accessibilityLabel(store.favorites.contains(farm.id) ? "إزالة \(farm.name) من المفضلة" : "إضافة \(farm.name) للمفضلة")
        }
    }
}

@MainActor
struct FavoritesView: View {
    @EnvironmentObject private var store: AppStore
    private var farms: [Farm] { store.farms.filter { store.favorites.contains($0.id) } }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 20) {
                if let error = store.catalogError { NoticeView(message: error, isError: true) }
                if farms.isEmpty {
                    EmptyState(symbol: "heart", title: "الأماكن اللي تعجبك، هنا", message: "اضغط القلب على أي مزرعة حتى ترجع إلها بسهولة. المفضلة محفوظة على هذا الجهاز.")
                } else { ForEach(farms) { FarmCard(farm: $0) } }
            }.padding(20)
        }
        .background(Theme.canvas)
        .navigationTitle("المفضلة")
        .refreshable { await store.refreshCatalog() }
    }
}
