RELEASE_DIR="/home/hayden/code/GooseClient/AsperetaClient/bin/Release"
X86_LIB_DIR="/home/hayden/code/GooseClient_Buildx86"
X64_LIB_DIR="/home/hayden/code/GooseClient_Buildx64"
DATA_DIR="/home/hayden/code/GooseClient_BuildData"
today=`date +%Y-%m-%d`
OUTPUT_PATH="/home/hayden/code"
X86_OUTPUT_DIR="GooseClient_x86_$today"
X64_OUTPUT_DIR="GooseClient_$today"
X86_ZIP="$X86_OUTPUT_DIR.zip"
X64_ZIP="$X64_OUTPUT_DIR.zip"

rm -r $RELEASE_DIR
rm -r $OUTPUT_PATH/$X86_OUTPUT_DIR
rm -r $OUTPUT_PATH/$X64_OUTPUT_DIR
rm -r $OUTPUT_PATH/$X86_ZIP
rm -r $OUTPUT_PATH/$X64_ZIP

dotnet publish -c Release -r win-x64 --self-contained false
dotnet publish -c Release -r win-x86 --self-contained false
dotnet publish -c Release -r osx-x64 --self-contained false
dotnet publish -c Release -r linux-x64 --self-contained false

rm $RELEASE_DIR/netcoreapp3.1/win-x64/publish/*.pdb
rm $RELEASE_DIR/netcoreapp3.1/win-x86/publish/*.pdb

cd $OUTPUT_PATH
mkdir $X64_OUTPUT_DIR
cp -r $RELEASE_DIR/netcoreapp3.1/win-x64/publish/* $X64_OUTPUT_DIR/
cp "$RELEASE_DIR/netcoreapp3.1/linux-x64/publish/AsperetaClient" $X64_OUTPUT_DIR/
cp "$RELEASE_DIR/netcoreapp3.1/osx-x64/publish/AsperetaClient" $X64_OUTPUT_DIR/AsperetaClient_osx
cp -r $DATA_DIR/* $X64_OUTPUT_DIR
cp -r $X64_LIB_DIR/* $X64_OUTPUT_DIR
zip -r $X64_ZIP $X64_OUTPUT_DIR

mkdir $X86_OUTPUT_DIR
cp -r $RELEASE_DIR/netcoreapp3.1/win-x86/publish/* $X86_OUTPUT_DIR/
cp -r $DATA_DIR/* $X86_OUTPUT_DIR/
cp -r $X86_LIB_DIR/* $X86_OUTPUT_DIR/
zip -r $X86_ZIP $X86_OUTPUT_DIR

rm -r $X86_OUTPUT_DIR
rm -r $X64_OUTPUT_DIR

cd "/home/hayden/code/GooseClient/AsperetaClient"