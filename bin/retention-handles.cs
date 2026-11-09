// MIT. Windows handle-relative access for plugin-owned retention records.
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public sealed class RetentionHandle : IDisposable {
  [StructLayout(LayoutKind.Sequential)]
  private struct Name { public ushort Length, MaximumLength; public IntPtr Buffer; }
  [StructLayout(LayoutKind.Sequential)]
  private struct Attributes {
    public int Length;
    public IntPtr Root, Name;
    public int Flags;
    public IntPtr Security, Quality;
  }
  [StructLayout(LayoutKind.Sequential)]
  private struct IoStatus { public IntPtr Status, Information; }
  [StructLayout(LayoutKind.Sequential)]
  private struct Information {
    public uint Flags, CreatedLow, CreatedHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("ntdll.dll")]
  private static extern int NtCreateFile(out SafeFileHandle file, uint access, ref Attributes attributes,
    out IoStatus status, IntPtr allocation, uint fileAttributes, uint share, uint disposition,
    uint options, IntPtr ea, uint eaLength);
  [DllImport("ntdll.dll")] private static extern int RtlNtStatusToDosError(int status);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security,
    uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern bool GetFileInformationByHandle(SafeFileHandle file, out Information info);
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern bool SetFileInformationByHandle(SafeFileHandle file, int kind, ref byte value, uint size);
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern bool ReadFile(SafeFileHandle file, byte[] data, int length, out int read, IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern bool WriteFile(SafeFileHandle file, byte[] data, int length, out int written, IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern bool FlushFileBuffers(SafeFileHandle file);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern uint GetFinalPathNameByHandle(SafeFileHandle file, System.Text.StringBuilder name, uint length, uint flags);

  private const uint ReadData=1, WriteData=2, Traverse=0x20, ReadAttributes=0x80;
  private const uint Delete=0x10000, Synchronize=0x100000;
  private const uint ShareRead=1, ShareWrite=2;
  private const uint Open=1, Create=2;
  private const uint ReparsePoint=0x400, Directory=0x10;
  private readonly SafeFileHandle file;
  private readonly string path;
  private readonly RetentionHandle parent;

  private RetentionHandle(SafeFileHandle file, string path, bool directory, RetentionHandle parent) {
    this.file=file; this.path=path; this.parent=parent;
    try {
      Information info=Inspect(file);
      if ((info.Flags & ReparsePoint)!=0 || ((info.Flags & Directory)!=0)!=directory || (!directory && info.Links!=1))
        throw new IOException("Unsafe retention entry");
    } catch { file.Dispose(); throw; }
  }

  private static Information Inspect(SafeFileHandle handle) {
    Information info;
    if (!GetFileInformationByHandle(handle,out info)) throw new Win32Exception();
    return info;
  }

  // Keep every ancestor open without FILE_SHARE_DELETE. Resolve all child names
  // against a kernel directory handle with OBJ_DONT_REPARSE, never by path.
  public static RetentionHandle OpenDirectory(string directory) {
    string full=Path.GetFullPath(directory), root=Path.GetPathRoot(full);
    if (root.Length!=3 || root[1]!=':') throw new IOException("Local drive required");
    var chain=new RetentionHandle(CreateFile(root,ReadAttributes|Traverse,ShareRead|ShareWrite,
      IntPtr.Zero,3,0x02200000,IntPtr.Zero),root,true,null);
    try {
      foreach (string name in full.Substring(root.Length).Split(new[]{'\\'},StringSplitOptions.RemoveEmptyEntries))
        chain=chain.OpenChild(name,true,false,true);
      return chain;
    } catch { chain.Dispose(); throw; }
  }

  private RetentionHandle OpenChild(string name, bool directory, bool delete, bool ownParent) {
    uint access=ReadAttributes|ReadData|(directory?Traverse:0)|(delete?Delete:0);
    uint share=directory ? ShareRead|ShareWrite : delete ? 0 : ShareRead;
    return Child(name,directory,access,share,Open,ownParent);
  }
  public RetentionHandle OpenChild(string name, bool directory, bool delete) { return OpenChild(name,directory,delete,false); }
  public RetentionHandle CreateFile(string name) { return Child(name,false,ReadAttributes|WriteData,ShareRead,Create,false); }
  public RetentionHandle CreateDirectory(string name) { return Child(name,true,ReadAttributes|ReadData|Traverse,ShareRead|ShareWrite,3,false); }

  private RetentionHandle Child(string name, bool directory, uint access, uint share, uint disposition, bool ownParent) {
    if (String.IsNullOrEmpty(name) || name.Length>255 || name.IndexOfAny(Path.GetInvalidFileNameChars())>=0 ||
        name.EndsWith(".",StringComparison.Ordinal) || name.EndsWith(" ",StringComparison.Ordinal))
      throw new IOException("Unsafe retention name");
    IntPtr text=Marshal.StringToHGlobalUni(name), pointer=IntPtr.Zero;
    try {
      var value=new Name{Length=(ushort)(2*name.Length),MaximumLength=(ushort)(2*(name.Length+1)),Buffer=text};
      pointer=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Name)));
      Marshal.StructureToPtr(value,pointer,false);
      var attributes=new Attributes{Length=Marshal.SizeOf(typeof(Attributes)),Root=file.DangerousGetHandle(),Name=pointer,Flags=0x1040};
      SafeFileHandle child; IoStatus status;
      // FILE_OPEN_REPARSE_POINT, FILE_SYNCHRONOUS_IO_NONALERT, and explicit type.
      int result=NtCreateFile(out child,access|Synchronize,ref attributes,out status,IntPtr.Zero,0x80,share,disposition,
        0x200020u|(directory?1u:0x40u),IntPtr.Zero,0);
      if (result<0) { if(child!=null) child.Dispose(); throw new Win32Exception(RtlNtStatusToDosError(result)); }
      return new RetentionHandle(child,Path.Combine(path,name),directory,ownParent?this:null);
    } finally { if(pointer!=IntPtr.Zero)Marshal.FreeHGlobal(pointer); Marshal.FreeHGlobal(text); }
  }

  public string[] Names() {
    // Enumeration suggests names only. Every opened object is checked by handle.
    string[] names=System.IO.Directory.GetFileSystemEntries(path);
    return Array.ConvertAll(names,Path.GetFileName);
  }
  public DateTime LastWriteUtc {
    get { Information i=Inspect(file);return DateTime.FromFileTimeUtc(((long)i.WriteHigh<<32)|i.WriteLow); }
  }
  public string Identity { get { return IdentityOf(file); } }
  private static string IdentityOf(SafeFileHandle handle) {
    Information i=Inspect(handle);
    return String.Format("{0:x8}{1:x8}{2:x8}{3:x8}{4:x8}",i.Volume,i.IndexHigh,i.IndexLow,i.CreatedHigh,i.CreatedLow);
  }
  public static bool MatchesOpenFile(SafeFileHandle handle, string expectedPath) {
    Information info=Inspect(handle);
    if((info.Flags&(ReparsePoint|Directory))!=0 || info.Links!=1)return false;
    var name=new System.Text.StringBuilder(32768);
    uint length=GetFinalPathNameByHandle(handle,name,(uint)name.Capacity,0);
    return length>0 && length<name.Capacity && String.Equals(name.ToString(),@"\\?\"+expectedPath,StringComparison.OrdinalIgnoreCase);
  }
  public string ReadText(int limit) {
    Information i=Inspect(file);
    if(i.SizeHigh!=0 || i.SizeLow>limit) throw new IOException("Oversized retention record");
    byte[] bytes=new byte[i.SizeLow]; int read;
    if(bytes.Length>0 && (!ReadFile(file,bytes,bytes.Length,out read,IntPtr.Zero)||read!=bytes.Length)) throw new IOException("Incomplete retention record");
    return new System.Text.UTF8Encoding(false,true).GetString(bytes).TrimStart('\uFEFF');
  }
  public void Write(byte[] bytes, bool durable) {
    int written;
    if(!WriteFile(file,bytes,bytes.Length,out written,IntPtr.Zero)||written!=bytes.Length)throw new IOException("Retention write failed");
    if(durable && !FlushFileBuffers(file))throw new Win32Exception();
  }
  public void Remove() {
    Information info=Inspect(file);
    if((info.Flags&ReparsePoint)!=0 || ((info.Flags&Directory)==0 && info.Links!=1))throw new IOException("Unsafe retention entry");
    byte delete=1;
    if (!SetFileInformationByHandle(file,4,ref delete,1)) throw new Win32Exception();
  }
  public void Dispose() { file.Dispose(); if(parent!=null)parent.Dispose(); }
}
