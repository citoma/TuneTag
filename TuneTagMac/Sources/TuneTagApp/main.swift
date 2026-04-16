import SwiftUI
import UniformTypeIdentifiers

@main
struct TuneTagApp: App {
    var body: some Scene {
        WindowGroup("TuneTag") {
            ContentView()
                .frame(minWidth: 1100, minHeight: 720)
        }
        .windowStyle(.automatic)
    }
}

enum FileStatus: String {
    case original = "原始"
    case modified = "已修改"
    case saveFailed = "保存失败"
}

struct TrackFile: Identifiable {
    let id = UUID()
    let fileName: String
    var artist: String
    var album: String
    var year: String
    var title: String
    var trackNo: String
    var status: FileStatus
}

struct ContentView: View {
    @State private var hasImported = false
    @State private var files: [TrackFile] = [
        TrackFile(fileName: "01. Midnight City.flac", artist: "M83", album: "Hurry Up, We're Dreaming", year: "2011", title: "Midnight City", trackNo: "1/22", status: .modified),
        TrackFile(fileName: "02. Reunion.flac", artist: "M83", album: "Hurry Up, We're Dreaming", year: "2011", title: "Reunion", trackNo: "2/22", status: .original),
        TrackFile(fileName: "Stay.mp3", artist: "Hans Zimmer", album: "Interstellar OST", year: "2014", title: "Stay", trackNo: "5/16", status: .original),
        TrackFile(fileName: "Starboy.flac", artist: "The Weeknd", album: "Starboy", year: "2016", title: "Starboy", trackNo: "1/18", status: .original)
    ]
    @State private var selected: TrackFile.ID?

    var body: some View {
        Group {
            if hasImported {
                workspaceView
            } else {
                emptyStateView
            }
        }
        .background(Color(nsColor: NSColor.windowBackgroundColor))
    }

    private var topBar: some View {
        HStack {
            Text("TuneTag")
                .font(.system(size: 20, weight: .semibold))

            Spacer()

            if hasImported {
                Button("保存") {}
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(.horizontal, 20)
        .frame(height: 48)
        .background(.ultraThinMaterial)
    }

    private var emptyStateView: some View {
        VStack(spacing: 0) {
            topBar

            Spacer()

            VStack(spacing: 24) {
                VStack(spacing: 18) {
                    Image(systemName: "doc.badge.plus")
                        .font(.system(size: 44, weight: .regular))
                        .foregroundStyle(.secondary)

                    VStack(spacing: 6) {
                        Text("准备好编辑了吗？")
                            .font(.system(size: 28, weight: .bold))
                        Text("拖入媒体文件或文件夹开始工作")
                            .font(.system(size: 15))
                            .foregroundStyle(.secondary)
                    }

                    HStack(spacing: 10) {
                        Button("选择文件") {
                            hasImported = true
                            selected = files.first?.id
                        }
                        .buttonStyle(.borderedProminent)

                        Button("载入示例") {
                            hasImported = true
                            selected = files.first?.id
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .frame(maxWidth: 620, minHeight: 320)
                .padding(40)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(nsColor: .underPageBackgroundColor))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(style: StrokeStyle(lineWidth: 2, dash: [8, 12]))
                        .foregroundStyle(Color(nsColor: .separatorColor))
                )
                .onDrop(of: [UTType.fileURL.identifier], isTargeted: nil) { _ in
                    hasImported = true
                    selected = files.first?.id
                    return true
                }

                HStack(spacing: 24) {
                    Label("支持 MP3, FLAC, WAV", systemImage: "music.note")
                    Label("支持批量导入", systemImage: "folder")
                }
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            }

            Spacer()
        }
    }

    private var workspaceView: some View {
        VStack(spacing: 0) {
            topBar

            HStack(spacing: 0) {
                fileListView
                    .frame(minWidth: 760)

                Divider()

                detailPanelView
                    .frame(width: 340)
            }
        }
    }

    private var fileListView: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                header("文件名", width: 260)
                header("歌手", width: 160)
                header("专辑", width: 220)
                header("年份", width: 90)
                header("状态", width: 100)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .frame(height: 34)
            .background(Color(nsColor: .controlBackgroundColor))

            List(selection: $selected) {
                ForEach(files) { file in
                    fileRow(file)
                        .tag(file.id)
                }
            }
            .listStyle(.plain)
        }
    }

    private func header(_ text: String, width: CGFloat) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.secondary)
            .frame(width: width, alignment: .leading)
            .textCase(.uppercase)
    }

    private func fileRow(_ file: TrackFile) -> some View {
        HStack(spacing: 0) {
            Text(file.fileName).frame(width: 260, alignment: .leading)
            Text(file.artist).frame(width: 160, alignment: .leading).foregroundStyle(.secondary)
            Text(file.album).frame(width: 220, alignment: .leading).foregroundStyle(.secondary)
            Text(file.year).frame(width: 90, alignment: .leading).foregroundStyle(.secondary)
            Text(file.status.rawValue)
                .frame(width: 100, alignment: .leading)
                .foregroundStyle(file.status == .modified ? .blue : .secondary)
            Spacer(minLength: 0)
        }
        .font(.system(size: 13, weight: .medium))
        .padding(.vertical, 4)
    }

    private var selectedFileIndex: Int? {
        guard let selected else { return nil }
        return files.firstIndex { $0.id == selected }
    }

    private var detailPanelView: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("基础信息")
                .font(.system(size: 14, weight: .bold))

            if let idx = selectedFileIndex {
                LabeledInput(label: "标题", text: $files[idx].title)
                LabeledInput(label: "艺术家", text: $files[idx].artist)
                LabeledInput(label: "专辑", text: $files[idx].album)

                HStack(spacing: 10) {
                    LabeledInput(label: "年份", text: $files[idx].year)
                    LabeledInput(label: "曲目号", text: $files[idx].trackNo)
                }

                Spacer()

                Text("已选中 1 个文件")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            } else {
                Text("请选择一个文件")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor))
    }
}

struct LabeledInput: View {
    let label: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
            TextField(label, text: $text)
                .textFieldStyle(.roundedBorder)
        }
    }
}
