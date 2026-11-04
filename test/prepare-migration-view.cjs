// Generate the functional migration variant from the accepted WPF resource.
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),file=path.join(root,'bin/restore-window.xaml');let s=fs.readFileSync(file,'utf8');
const target=s.match(/<Grid><Grid.ColumnDefinitions><ColumnDefinition Width="\*"\/><ColumnDefinition Width="Auto"\/><\/Grid.ColumnDefinitions><TextBox x:Name="Target"[^\n]+/)[0];
s=s.replace(target,'<TextBlock Text="Home、Profile、agents 与必要数据目录将由计划自动安排。" Style="{StaticResource Hint}"/>');
s=s.replace('<Button x:Name="Check"', '<TextBlock Text="新 Workspace 根目录（必须不存在，父目录已存在）" FontWeight="SemiBold" Margin="0,12,0,8"/>'+target.replace('全新目标 Home','新 Workspace 根目录').replace('选择父目录','选择目录位置')+'<Button x:Name="Check"');
s=s.replaceAll('选择 DSH 程序','选择安装目录').replaceAll('用于恢复的 DSH 程序','新 DSH 安装目录').replaceAll('选择电脑安装目录中的 DeepSeek Harness.exe，用来核对备份是否兼容。DSH 界面无需运行。','选择包含 DeepSeek Harness.exe 与 resources 的安装目录。迁移依据实际功能、依赖和数据格式判断，不要求版本号相等。').replaceAll('只检查文件可暂不选择；继续恢复前必须选择匹配版本。备份不含 DSH 安装程序，助手也不会下载或安装。','选择 ZIP 和两个路径后生成计划。未知项目可检查并暂存验证；关键问题未验证时禁止完整提交。').replaceAll('新环境文件夹（将由助手创建）','核对迁移计划').replaceAll('直接在输入框填写新路径，无需提前创建文件夹。“选择父目录”只选择它的上一层目录。','新 Home 位于 Workspace 的同级独立数据目录，防止递归备份。').replaceAll('全新 Home 与私人确认','迁移计划与私人确认');
s=s.replace('<Button x:Name="Check" Content="检查备份"','<Button x:Name="Check" Content="检查并生成计划"');
s=s.replace('<TextBlock x:Name="TargetFeedback"','<Button x:Name="StrictRestore" Content="打开 v0.5 严格恢复通道" HorizontalAlignment="Left" Margin="0,0,0,12"/><TextBlock x:Name="TargetFeedback"');
fs.writeFileSync(path.join(root,'bin/migrate-window.xaml'),s);
